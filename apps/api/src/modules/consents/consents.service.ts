import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { digest } from '../auth/security.js';

// Exemplos de teste: não são documentos jurídicos publicados da operação.
export const DEMO_DOCUMENTS = [
  {
    id: 'demo-accompaniment-v1',
    purpose: 'accompaniment',
    version: 'demo-1',
    content:
      'EXEMPLO PARA TESTE. Aceito simular o vínculo de acompanhamento esportivo com o treinador indicado. Este aceite demonstrativo não autoriza coleta real de dados esportivos. Posso retirar o aceite e encerrar o vínculo pelo mecanismo seguro disponibilizado na confirmação.',
  },
  {
    id: 'demo-data-v1',
    purpose: 'data-sharing',
    version: 'demo-1',
    content:
      'EXEMPLO PARA TESTE — TERMOS E PRIVACIDADE. Aceito simular o registro e o compartilhamento dos dados fictícios deste formulário com o treinador indicado, para testar a gestão do acompanhamento no BalduCore. Não informe dados pessoais reais. Não há autorização Garmin ou coleta de atividades nesta etapa. Documentos, bases legais, retenção e canais para exercício de direitos precisam de aprovação antes do uso real.',
  },
].map((document) => ({
  ...document,
  contentHash: digest(document.content),
  isSynthetic: true,
}));

export class ConsentsService {
  async ensureDocuments(tx: Prisma.TransactionClient) {
    await tx.consentDocument.createMany({
      data: DEMO_DOCUMENTS,
      skipDuplicates: true,
    });
    const stored = await tx.consentDocument.findMany({
      where: { id: { in: DEMO_DOCUMENTS.map((doc) => doc.id) } },
    });
    if (
      stored.length !== DEMO_DOCUMENTS.length ||
      stored.some((doc) => {
        const expected = DEMO_DOCUMENTS.find((item) => item.id === doc.id)!;
        return (
          doc.contentHash !== expected.contentHash ||
          doc.content !== expected.content ||
          doc.version !== expected.version ||
          !doc.isSynthetic
        );
      })
    )
      throw new ConflictException(
        'Versão dos documentos indisponível. Solicite revisão.',
      );
  }
  async accept(
    tx: Prisma.TransactionClient,
    scope: { coachId: string; athleteId: string; enrollmentId: string },
  ) {
    await this.ensureDocuments(tx);
    await tx.consentEvidence.createMany({
      data: DEMO_DOCUMENTS.map((doc) => ({
        ...scope,
        documentId: doc.id,
        decision: 'accepted' as const,
      })),
    });
  }
  async withdraw(
    tx: Prisma.TransactionClient,
    coachId: string,
    athleteId: string,
  ) {
    const accepted = await tx.consentEvidence.findMany({
      where: { coachId, athleteId, decision: 'accepted' },
    });
    await tx.consentEvidence.createMany({
      data: accepted.map((item) => ({
        coachId,
        athleteId,
        enrollmentId: item.enrollmentId,
        documentId: item.documentId,
        decision: 'withdrawn' as const,
      })),
      skipDuplicates: true,
    });
  }
}
