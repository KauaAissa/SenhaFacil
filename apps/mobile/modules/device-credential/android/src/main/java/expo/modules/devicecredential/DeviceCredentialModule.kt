package expo.modules.devicecredential

import android.app.KeyguardManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import androidx.annotation.RequiresApi
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.UnrecoverableKeyException
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DeviceCredentialModule : Module() {
  private data class Operation(
    val promise: Promise,
    val signal: CancellationSignal,
    val bytes: ByteArray?,
    val newAlias: String?
  )

  private var pending: Operation? = null
  private val context get() = requireNotNull(appContext.reactContext)
  private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private fun ownerHash(owner: String): String {
    require(owner.isNotBlank() && owner.length <= 128) { "Invalid account identifier" }
    return MessageDigest.getInstance("SHA-256").digest(owner.toByteArray()).joinToString("") { "%02x".format(it) }
  }
  private fun prefix(owner: String) = "sf_device_${ownerHash(owner)}_"
  private fun recordFile(owner: String) = AtomicFile(File(context.noBackupFilesDir, "sf_device_${ownerHash(owner)}.json"))
  private fun readRecord(owner: String): JSONObject? {
    val file = recordFile(owner)
    if (!file.baseFile.exists()) return null
    return file.openRead().use { JSONObject(it.bufferedReader().readText()) }.also {
      require(it.getInt("version") == 1 && it.getString("alias").startsWith(prefix(owner))) { "Invalid protected record" }
    }
  }
  private fun secure(): Boolean = context.getSystemService(KeyguardManager::class.java).isDeviceSecure
  private fun digest(bytes: ByteArray) = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(bytes), Base64.NO_WRAP)

  override fun definition() = ModuleDefinition {
    Name("SenhaFacilDeviceCredential")

    AsyncFunction("getStatus") { owner: String ->
      val record = readRecord(owner)
      val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
      val configured = secure()
      val present = record != null && keyStore().containsAlias(record.getString("alias"))
      mapOf("supported" to supported, "secure" to configured, "enabled" to (configured && present),
        "needsReactivation" to (record != null && (!configured || !present)))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("enable") { owner: String, keyBase64: String, promise: Promise ->
      var bytes: ByteArray? = null
      var alias: String? = null
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw UnsupportedOperationException()
        if (!secure()) throw NoCredentialException()
        check(pending == null) { "Authentication already in progress" }
        bytes = Base64.decode(keyBase64, Base64.NO_WRAP)
        require(bytes.size == 32) { "Invalid vault key" }
        alias = prefix(owner) + UUID.randomUUID()
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
          .setKeySize(256)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setUserAuthenticationRequired(true)
          .setUserAuthenticationParameters(0, KeyProperties.AUTH_DEVICE_CREDENTIAL)
          .build())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, generator.generateKey())
        val cleartext = bytes
        val createdAlias = alias
        authenticate(cipher, promise, cleartext, createdAlias, "Ativar bloqueio do aparelho") { authenticated ->
          val ciphertext = authenticated.doFinal(cleartext)
          val record = JSONObject().put("version", 1).put("alias", createdAlias)
            .put("iv", Base64.encodeToString(authenticated.iv, Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .put("keyDigest", digest(cleartext))
          val file = recordFile(owner)
          val stream = file.startWrite()
          try { stream.write(record.toString().toByteArray()); file.finishWrite(stream) }
          catch (error: Exception) { file.failWrite(stream); throw error }
          deleteAliases(owner, createdAlias)
          null
        }
      } catch (error: Exception) {
        rejectOperation(Operation(promise, CancellationSignal(), bytes, alias), errorCode(error), error)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("unlock") { owner: String, promise: Promise ->
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw UnsupportedOperationException()
        if (!secure()) throw NoCredentialException()
        check(pending == null) { "Authentication already in progress" }
        val record = readRecord(owner) ?: throw MissingKeyException()
        val key = keyStore().getKey(record.getString("alias"), null) as? SecretKey ?: throw MissingKeyException()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, Base64.decode(record.getString("iv"), Base64.NO_WRAP)))
        authenticate(cipher, promise, null, null, "Desbloquear Senha Facil") { authenticated ->
          val bytes = authenticated.doFinal(Base64.decode(record.getString("ciphertext"), Base64.NO_WRAP))
          try {
            require(bytes.size == 32) { "Invalid vault key" }
            Base64.encodeToString(bytes, Base64.NO_WRAP)
          } finally { bytes.fill(0) }
        }
      } catch (error: Exception) { reject(promise, error) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("disable") { owner: String ->
      cancelPending()
      deleteAliases(owner)
      recordFile(owner).delete()
    }.runOnQueue(Queues.MAIN)

    // A successful password login can replace the vault key after recovery.
    AsyncFunction("reconcile") { owner: String, keyBase64: String ->
      val record = readRecord(owner)
      if (record != null) {
        val bytes = Base64.decode(keyBase64, Base64.NO_WRAP)
        try {
          require(bytes.size == 32) { "Invalid vault key" }
          if (record.getString("keyDigest") != digest(bytes)) {
            deleteAliases(owner)
            recordFile(owner).delete()
          }
        } finally { bytes.fill(0) }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") { cancelPending() }.runOnQueue(Queues.MAIN)
    OnDestroy { Handler(Looper.getMainLooper()).post { cancelPending() } }
  }

  @RequiresApi(Build.VERSION_CODES.R)
  private fun authenticate(
    cipher: Cipher, promise: Promise, bytes: ByteArray?, alias: String?, title: String,
    complete: (Cipher) -> String?
  ) {
    val activity = appContext.currentActivity ?: throw IllegalStateException("Activity unavailable")
    val operation = Operation(promise, CancellationSignal(), bytes, alias)
    pending = operation
    try {
      BiometricPrompt.Builder(activity).setTitle(title)
        .setDescription("Use o PIN, padrao ou senha de bloqueio deste aparelho.")
        .setAllowedAuthenticators(BiometricManager.Authenticators.DEVICE_CREDENTIAL).build()
        .authenticate(BiometricPrompt.CryptoObject(cipher), operation.signal, activity.mainExecutor,
          object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
              if (pending !== operation) return
              pending = null
              try {
                check(result.authenticationType == BiometricPrompt.AUTHENTICATION_RESULT_TYPE_DEVICE_CREDENTIAL)
                val authenticated = result.cryptoObject?.cipher ?: throw IllegalStateException("Missing authenticated cipher")
                promise.resolve(complete(authenticated))
              } catch (error: Exception) {
                rejectOperation(operation, errorCode(error), error)
              } finally { bytes?.fill(0) }
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
              if (pending !== operation) return
              pending = null
              val code = when (errorCode) {
                BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED, BiometricPrompt.BIOMETRIC_ERROR_CANCELED -> "DEVICE_AUTH_CANCELLED"
                BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT, BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT -> "DEVICE_AUTH_LOCKED_OUT"
                BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL -> "DEVICE_AUTH_NOT_CONFIGURED"
                else -> "DEVICE_AUTH_FAILED"
              }
              rejectOperation(operation, code)
            }
          })
    } catch (error: Exception) {
      pending = null
      throw error
    }
  }

  private fun deleteAliases(owner: String, keep: String? = null) {
    val store = keyStore()
    store.aliases().toList().filter { it.startsWith(prefix(owner)) && it != keep }.forEach { store.deleteEntry(it) }
  }

  private fun cancelPending() {
    val operation = pending ?: return
    pending = null
    try { operation.signal.cancel() }
    catch (error: Exception) { rejectOperation(operation, "DEVICE_AUTH_FAILED", error); return }
    rejectOperation(operation, "DEVICE_AUTH_CANCELLED")
  }

  private fun rejectOperation(operation: Operation, code: String, cause: Exception? = null) {
    operation.bytes?.fill(0)
    try {
      if (operation.newAlias != null) keyStore().deleteEntry(operation.newAlias)
    } catch (error: Exception) {
      operation.promise.reject("DEVICE_AUTH_FAILED", "Failed to clean up unfinished protected key", error)
      return
    }
    operation.promise.reject(code, "Device credential operation did not complete", cause)
  }

  private fun reject(promise: Promise, error: Exception) {
    promise.reject(errorCode(error), "Device credential operation failed", error)
  }

  private fun errorCode(error: Exception): String =
    when (error) {
      is KeyPermanentlyInvalidatedException, is UnrecoverableKeyException, is MissingKeyException -> "DEVICE_AUTH_KEY_INVALIDATED"
      is NoCredentialException -> "DEVICE_AUTH_NOT_CONFIGURED"
      is UnsupportedOperationException -> "DEVICE_AUTH_UNSUPPORTED"
      else -> "DEVICE_AUTH_FAILED"
    }

  private class MissingKeyException : Exception()
  private class NoCredentialException : Exception()
}
