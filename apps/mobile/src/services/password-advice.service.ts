import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { adjacencyGraphs, dictionary as commonDictionary } from '@zxcvbn-ts/language-common';
import { dictionary } from '@zxcvbn-ts/language-pt-br';

const estimator = new ZxcvbnFactory({ graphs: adjacencyGraphs, dictionary: { ...commonDictionary, ...dictionary } });

export function passwordAdvice(password: string, personalWords: string[] = []): { score: number; label: string; advice: string } | null {
  if (!password) return null;
  const result = estimator.check(password.slice(0, 100), personalWords.filter(Boolean));
  return { score: result.score, label: ['Muito fraca', 'Fraca', 'Razoavel', 'Boa', 'Forte'][result.score],
    advice: result.score < 3 ? 'Prefira uma senha longa, sem nomes, datas ou sequencias. Use o gerador ou uma frase com palavras pouco relacionadas.'
      : 'Use esta senha somente nesta conta. A avaliacao local nao detecta senhas vazadas.' };
}