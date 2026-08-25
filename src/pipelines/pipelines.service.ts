import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isAdmin } from '../common/access';
import { DEFAULT_PIPELINE_NAME, DEFAULT_STAGES } from '../common/defaults';
import { PrismaService } from '../prisma/prisma.service';

const SYSTEM_STAGE_IDS = new Set(DEFAULT_STAGES.map((stage) => stage.id));
// NEW is the create-flow fallback. A final stage is also protected because
// completion/reward logic relies on there being one final customer stage.
const PROTECTED_STAGE_IDS = new Set(['NEW']);

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async pipelines() {
    const items = await this.prisma.pipeline.findMany({ include: { stages: { orderBy: { order: 'asc' } } } });
    return { items, total: items.length };
  }

  async defaultPipeline() {
    return this.prisma.pipeline.findFirstOrThrow({ where: { name: DEFAULT_PIPELINE_NAME } });
  }

  async stages(pipelineId?: string) {
    const pipeline = pipelineId ? await this.prisma.pipeline.findUnique({ where: { id: pipelineId } }) : await this.defaultPipeline();
    if (!pipeline) throw new NotFoundException('Pipeline topilmadi');
    const items = await this.prisma.stage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { order: 'asc' },
      include: { _count: { select: { customers: true } } },
    });
    return { items: items.map((stage) => this.stageDto(stage)), total: items.length };
  }

  async createStage(body: any, pipelineId?: string, actor?: any) {
    this.assertAdmin(actor);
    const pipeline = pipelineId ? await this.prisma.pipeline.findUnique({ where: { id: pipelineId } }) : await this.defaultPipeline();
    if (!pipeline) throw new NotFoundException('Pipeline topilmadi');
    const label = String(body.name || body.label || '').trim();
    if (!label) throw new BadRequestException('Bosqich nomi bo\'sh bo\'lishi mumkin emas');
    const stages = await this.prisma.stage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });
    const afterIndex = body.afterStageId ? stages.findIndex((s) => s.id === body.afterStageId) : stages.length - 1;
    const insertOrder = afterIndex >= 0 ? stages[afterIndex].order + 1 : stages.length + 1;
    const id = this.slugStage(body.id || label);
    await this.prisma.$transaction([
      this.prisma.stage.updateMany({ where: { pipelineId: pipeline.id, order: { gte: insertOrder } }, data: { order: { increment: 1 } } }),
      this.prisma.stage.create({ data: { id, label, order: insertOrder, isFinal: Boolean(body.isFinal), isSystem: false, pipelineId: pipeline.id } }),
    ]);
    return this.stages(pipeline.id).then((res) => res.items.find((s) => s.id === id));
  }

  async updateStage(id: string, body: any, actor?: any) {
    this.assertAdmin(actor);
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Bosqich topilmadi');
    if (body.direction) {
      const stages = await this.prisma.stage.findMany({ where: { pipelineId: stage.pipelineId }, orderBy: { order: 'asc' } });
      const index = stages.findIndex((s) => s.id === id);
      const swap = body.direction === 'left' ? stages[index - 1] : stages[index + 1];
      if (!swap) return { id: stage.id, label: stage.label, order: stage.order };
      await this.prisma.$transaction([
        this.prisma.stage.update({ where: { id: stage.id }, data: { order: swap.order } }),
        this.prisma.stage.update({ where: { id: swap.id }, data: { order: stage.order } }),
      ]);
      return this.stages(stage.pipelineId);
    }
    const label = String(body.name || body.label || '').trim();
    if (!label) throw new BadRequestException('Bosqich nomi bo\'sh bo\'lishi mumkin emas');
    if (this.isSystemStage(stage) && typeof body.isFinal === 'boolean' && body.isFinal !== stage.isFinal) {
      throw new BadRequestException('Tizim bosqichining yakuniy holatini o\'zgartirib bo\'lmaydi');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (body.isFinal === true) await tx.stage.updateMany({ where: { pipelineId: stage.pipelineId }, data: { isFinal: false } });
      return tx.stage.update({ where: { id }, data: { label, ...(typeof body.isFinal === 'boolean' ? { isFinal: body.isFinal } : {}) } });
    });
    return { id: updated.id, label: updated.label, name: updated.label, order: updated.order, isFinal: updated.isFinal, pipelineId: updated.pipelineId };
  }

  async reorder(body: any, actor?: any) {
    this.assertAdmin(actor);
    const stageIds: string[] = body.stageIds || body.ids || [];
    if (!stageIds.length) throw new BadRequestException('Bosqichlar tartibi yuborilmadi');
    const stages = await this.prisma.stage.findMany({ where: { id: { in: stageIds } } });
    if (stages.length !== stageIds.length || new Set(stages.map((stage) => stage.pipelineId)).size !== 1) {
      throw new BadRequestException('Bosqichlar bitta savdo jarayoniga tegishli bo\'lishi kerak');
    }
    await this.prisma.$transaction(stageIds.map((id, index) => this.prisma.stage.update({ where: { id }, data: { order: index + 1 } })));
    return { ok: true };
  }

  async deleteStage(id: string, replacementStageId?: string, actor?: any) {
    this.assertAdmin(actor);
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Bosqich topilmadi');
    this.assertMutable(stage);
    const replacementId = replacementStageId ? String(replacementStageId).trim() : undefined;
    const count = await this.prisma.customer.count({ where: { stageId: id } });
    if (count > 0 && !replacementId) throw new BadRequestException(`${count} ta mijoz bor. Ularni boshqa bosqichga ko'chirish kerak`);
    if (replacementId) {
      const replacement = await this.prisma.stage.findUnique({ where: { id: replacementId } });
      if (!replacement || replacement.pipelineId !== stage.pipelineId || replacement.id === stage.id) {
        throw new BadRequestException("Mijozlar uchun to'g'ri replacement bosqich tanlang");
      }
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const relatedCustomers = await tx.customer.count({ where: { stageId: id } });
        if (relatedCustomers > 0 && !replacementId) {
          throw new BadRequestException(`${relatedCustomers} ta mijoz bor. Ularni boshqa bosqichga ko'chirish kerak`);
        }
        if (relatedCustomers > 0) {
          await tx.customer.updateMany({ where: { stageId: id }, data: { stageId: replacementId } });
        }
        await tx.stage.delete({ where: { id } });
        const remainingStages = await tx.stage.findMany({ where: { pipelineId: stage.pipelineId }, orderBy: { order: 'asc' } });
        for (const [index, remainingStage] of remainingStages.entries()) {
          await tx.stage.update({ where: { id: remainingStage.id }, data: { order: index + 1 } });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('Bosqichga bog\'langan mijozlarni avval boshqa bosqichga ko\'chirish kerak');
      }
      throw error;
    }
    return { ok: true, id };
  }

  private stageDto(stage: any) {
    const isSystem = this.isSystemStage(stage);
    const isProtected = this.isProtectedStage(stage);
    return {
      id: stage.id,
      label: stage.label,
      name: stage.label,
      order: stage.order,
      isFinal: stage.isFinal,
      isSystem,
      isDefault: isSystem,
      isProtected,
      pipelineId: stage.pipelineId,
      customerCount: stage._count?.customers ?? undefined,
    };
  }

  private isSystemStage(stage: any) {
    return Boolean(stage.isSystem) || SYSTEM_STAGE_IDS.has(stage.id);
  }

  private assertMutable(stage: any) {
    if (this.isProtectedStage(stage)) throw new BadRequestException(`"${stage.label}" bosqichi majburiy va o\'chirib bo\'lmaydi`);
  }

  private isProtectedStage(stage: any) {
    return PROTECTED_STAGE_IDS.has(stage.id) || Boolean(stage.isFinal);
  }

  private assertAdmin(actor?: any) {
    if (!isAdmin(actor)) throw new ForbiddenException('Voronka bosqichlarini faqat admin boshqara oladi');
  }

  private slugStage(value: string) {
    const base = String(value || 'STAGE')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${base || 'STAGE'}_${Date.now().toString(36).toUpperCase()}`;
  }
}
