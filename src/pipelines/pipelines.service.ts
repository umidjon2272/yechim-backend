import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_PIPELINE_NAME } from '../common/defaults';
import { PrismaService } from '../prisma/prisma.service';

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
    const items = await this.prisma.stage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });
    return { items: items.map((s) => ({ id: s.id, label: s.label, name: s.label, order: s.order, isFinal: s.isFinal, pipelineId: s.pipelineId })), total: items.length };
  }

  async createStage(body: any, pipelineId?: string) {
    const pipeline = pipelineId ? await this.prisma.pipeline.findUnique({ where: { id: pipelineId } }) : await this.defaultPipeline();
    if (!pipeline) throw new NotFoundException('Pipeline topilmadi');
    const stages = await this.prisma.stage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } });
    const afterIndex = body.afterStageId ? stages.findIndex((s) => s.id === body.afterStageId) : stages.length - 1;
    const insertOrder = afterIndex >= 0 ? stages[afterIndex].order + 1 : stages.length + 1;
    const id = this.slugStage(body.id || body.name || body.label);
    await this.prisma.$transaction([
      this.prisma.stage.updateMany({ where: { pipelineId: pipeline.id, order: { gte: insertOrder } }, data: { order: { increment: 1 } } }),
      this.prisma.stage.create({ data: { id, label: body.name || body.label, order: insertOrder, isFinal: Boolean(body.isFinal), pipelineId: pipeline.id } }),
    ]);
    return this.stages(pipeline.id).then((res) => res.items.find((s) => s.id === id));
  }

  async updateStage(id: string, body: any) {
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
    const updated = await this.prisma.$transaction(async (tx) => {
      if (body.isFinal === true) await tx.stage.updateMany({ where: { pipelineId: stage.pipelineId }, data: { isFinal: false } });
      return tx.stage.update({ where: { id }, data: { label, ...(typeof body.isFinal === 'boolean' ? { isFinal: body.isFinal } : {}) } });
    });
    return { id: updated.id, label: updated.label, name: updated.label, order: updated.order, isFinal: updated.isFinal, pipelineId: updated.pipelineId };
  }

  async reorder(body: any) {
    const stageIds: string[] = body.stageIds || body.ids || [];
    if (!stageIds.length) throw new BadRequestException('Bosqichlar tartibi yuborilmadi');
    const stages = await this.prisma.stage.findMany({ where: { id: { in: stageIds } } });
    if (stages.length !== stageIds.length || new Set(stages.map((stage) => stage.pipelineId)).size !== 1) {
      throw new BadRequestException('Bosqichlar bitta savdo jarayoniga tegishli bo\'lishi kerak');
    }
    await this.prisma.$transaction(stageIds.map((id, index) => this.prisma.stage.update({ where: { id }, data: { order: index + 1 } })));
    return { ok: true };
  }

  async deleteStage(id: string, replacementStageId?: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Bosqich topilmadi');
    const count = await this.prisma.customer.count({ where: { stageId: id, deletedAt: null } });
    if (count > 0 && !replacementStageId) throw new BadRequestException("Mijozlarni boshqa bosqichga ko'chirish kerak");
    if (replacementStageId) {
      const replacement = await this.prisma.stage.findUnique({ where: { id: replacementStageId } });
      if (!replacement || replacement.pipelineId !== stage.pipelineId || replacement.id === stage.id) {
        throw new BadRequestException("Mijozlar uchun to'g'ri replacement bosqich tanlang");
      }
    }
    await this.prisma.$transaction(async (tx) => {
      if (count > 0) await tx.customer.updateMany({ where: { stageId: id }, data: { stageId: replacementStageId } });
      await tx.stage.delete({ where: { id } });
      const stages = await tx.stage.findMany({ where: { pipelineId: stage.pipelineId }, orderBy: { order: 'asc' } });
      await Promise.all(stages.map((s, index) => tx.stage.update({ where: { id: s.id }, data: { order: index + 1 } })));
    });
    return { ok: true };
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
