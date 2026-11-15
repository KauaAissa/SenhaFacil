BEGIN;

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "loginPhone" TEXT;
CREATE UNIQUE INDEX "users_loginPhone_key" ON "users"("loginPhone");
ALTER TABLE "users" ADD CONSTRAINT "users_login_identity_check"
  CHECK (("email" IS NOT NULL) <> ("loginPhone" IS NOT NULL));
ALTER TABLE "users" ADD CONSTRAINT "users_login_phone_format_check"
  CHECK ("loginPhone" IS NULL OR "loginPhone" ~ '^\+55[1-9][0-9]9[0-9]{8}$');

COMMIT;
