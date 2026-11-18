import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type { PrismaClient } from '../../generated/prisma/client.js';
const fields = {
  name: z.string().trim().min(3).max(120),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
};
const createSchema = z.object(fields).strict();
const updateSchema = z
  .object({ ...fields, version: z.number().int().positive() })
  .strict();
const listSchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    status: z.enum(['pending', 'active', 'ended']).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      'Dados inválidos. Verifique os campos e filtros.',
    );
  return parsed.data;
}
export class AthletesService {
  constructor(private readonly db: PrismaClient) {}
  async list(coachId: string, query: unknown) {
    const { q, status, page, limit } = input(listSchema, query);
    const where = {
      coachId,
      ...(status ? { relationship: { is: { status } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.db.$transaction([
      this.db.athlete.count({ where }),
      this.db.athlete.findMany({
        where,
        include: { relationship: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { items, total, page, limit };
  }
  async get(coachId: string, id: string) {
    const athlete = await this.db.athlete.findUnique({
      where: { coachId_id: { coachId, id } },
      include: { relationship: true },
    });
    if (!athlete) throw new NotFoundException('Aluno não encontrado.');
    return athlete;
  }
  async create(coachId: string, body: unknown) {
    const data = input(createSchema, body);
    try {
      return await this.db.$transaction(async (tx) => {
        const athlete = await tx.athlete.create({
          data: { ...data, coachId, relationship: { create: {} } },
          include: { relationship: true },
        });
        await tx.auditLog.create({
          data: { coachId, action: 'athlete.created', resourceId: athlete.id },
        });
        return athlete;
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  async update(coachId: string, id: string, body: unknown) {
    const { version, ...data } = input(updateSchema, body);
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "CoachAthleteRelationship" WHERE "coachId" = ${coachId} AND "athleteId" = ${id} FOR UPDATE`;
        const athlete = await tx.athlete.findUnique({
          where: { coachId_id: { coachId, id } },
        });
        if (!athlete) throw new NotFoundException('Aluno não encontrado.');
        if (data.email !== athlete.email) {
          await tx.invitation.updateMany({
            where: { coachId, athleteId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        const result = await tx.athlete.updateMany({
          where: { coachId, id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (!result.count)
          throw new ConflictException(
            'Cadastro alterado. Recarregue antes de salvar.',
          );
        await tx.auditLog.create({
          data: { coachId, action: 'athlete.updated', resourceId: id },
        });
        return tx.athlete.findUniqueOrThrow({
          where: { coachId_id: { coachId, id } },
          include: { relationship: true },
        });
      });
    } catch (error) {
      this.conflict(error);
    }
  }
  private conflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'Já existe aluno com esse e-mail neste treinador.',
      );
    throw error;
  }
}
