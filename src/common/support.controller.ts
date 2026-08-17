import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../permissions/public.decorator';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { SupportService } from './support.service';

@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Public()
  @Get('health')
  health() {
    return this.support.health();
  }

  @RequirePermissions('settings.view')
  @Get('roles')
  roles() {
    return { items: [{ id: 'ADMIN', name: 'ADMIN', permissions: [] }, { id: 'EMPLOYEE', name: 'EMPLOYEE', permissions: [] }], total: 2 };
  }

  @RequirePermissions('settings.view')
  @Get('roles/permissions-schema')
  permissionSchema() {
    return this.support.permissionsSchema();
  }

  @RequirePermissions('teams.view')
  @Get('teams')
  teams(@Query() query: any) {
    return this.support.teams(query);
  }

  @RequirePermissions('teams.create')
  @Post('teams')
  createTeam(@Body() body: any) {
    return this.support.createTeam(body);
  }

  @RequirePermissions('teams.edit')
  @Patch('teams/:id')
  updateTeam(@Param('id') id: string, @Body() body: any) {
    return this.support.updateTeam(id, body);
  }

  @RequirePermissions('customers.view')
  @Get('meta/customer-options')
  customerOptions() {
    return this.support.customerOptions();
  }

  @RequirePermissions('settings.view')
  @Get('customer-field-defs')
  fieldDefs(@Query() query: any) {
    return this.support.fieldDefs(query);
  }

  @RequirePermissions('settings.edit')
  @Post('customer-field-defs')
  createFieldDef(@Body() body: any) {
    return this.support.createFieldDef(body);
  }

  @RequirePermissions('settings.edit')
  @Patch('customer-field-defs/:id')
  updateFieldDef(@Param('id') id: string, @Body() body: any) {
    return this.support.updateFieldDef(id, body);
  }

  @RequirePermissions('settings.edit')
  @Delete('customer-field-defs/:id')
  deleteFieldDef(@Param('id') id: string) {
    return this.support.deleteFieldDef(id);
  }

  @RequirePermissions('settings.view')
  @Get('program-catalog')
  programCatalog(@Query() query: any) {
    return this.support.programCatalog(query);
  }

  @RequirePermissions('settings.edit')
  @Post('program-catalog')
  createProgram(@Body() body: any) {
    return this.support.createProgram(body);
  }

  @RequirePermissions('settings.edit')
  @Patch('program-catalog/:id')
  updateProgram(@Param('id') id: string, @Body() body: any) {
    return this.support.updateProgram(id, body);
  }

  @RequirePermissions('settings.edit')
  @Delete('program-catalog/:id')
  deleteProgram(@Param('id') id: string) {
    return this.support.deleteProgram(id);
  }

  @RequirePermissions('businesses.view')
  @Get('businesses')
  businesses(@Query() query: any) {
    return this.support.businesses(query);
  }

  @RequirePermissions('businesses.view')
  @Get('businesses/:id')
  business(@Param('id') id: string) {
    return this.support.business(id);
  }

  @RequirePermissions('businesses.create')
  @Post('businesses')
  createBusiness(@Body() body: any) {
    return this.support.createBusiness(body);
  }

  @RequirePermissions('businesses.edit')
  @Patch('businesses/:id')
  updateBusiness(@Param('id') id: string, @Body() body: any) {
    return this.support.updateBusiness(id, body);
  }

  @RequirePermissions('businesses.view')
  @Get('businesses/:id/products')
  businessProducts(@Param('id') id: string) {
    return { items: [], total: 0, businessId: id };
  }

  @RequirePermissions('leads.view')
  @Get('leads')
  leads(@Query() query: any) {
    return this.support.leads(query);
  }

  @RequirePermissions('leads.view')
  @Get('leads/:id')
  lead(@Param('id') id: string) {
    return this.support.lead(id);
  }

  @RequirePermissions('leads.create')
  @Post('leads')
  createLead(@Body() body: any) {
    return this.support.createLead(body);
  }

  @RequirePermissions('leads.edit')
  @Patch('leads/:id')
  updateLead(@Param('id') id: string, @Body() body: any) {
    return this.support.updateLead(id, body);
  }

  @RequirePermissions('leads.delete')
  @Delete('leads/:id')
  deleteLead(@Param('id') id: string) {
    return this.support.deleteLead(id);
  }

  @RequirePermissions('leads.convert')
  @Post('leads/:id/convert-to-deal')
  convertLead(@Param('id') id: string, @Body() body: any) {
    return this.support.convertLead(id, body);
  }

  @RequirePermissions('deals.view')
  @Get('deals')
  deals(@Query() query: any) {
    return this.support.deals(query);
  }

  @RequirePermissions('deals.view')
  @Get('deals/:id')
  deal(@Param('id') id: string) {
    return this.support.deal(id);
  }

  @RequirePermissions('deals.create')
  @Post('deals')
  createDeal(@Body() body: any) {
    return this.support.createDeal(body);
  }

  @RequirePermissions('deals.edit')
  @Patch('deals/:id')
  updateDeal(@Param('id') id: string, @Body() body: any) {
    return this.support.updateDeal(id, body);
  }

  @RequirePermissions('deals.changeStage')
  @Patch('deals/:id/stage')
  updateDealStage(@Param('id') id: string, @Body() body: any) {
    return this.support.updateDeal(id, { stage: body.stage });
  }

  @RequirePermissions('deals.view')
  @Get('deals/:dealId/items')
  dealItems(@Param('dealId') dealId: string) {
    return this.support.dealItems(dealId);
  }

  @RequirePermissions('deals.edit')
  @Post('deals/:dealId/items')
  createDealItem(@Param('dealId') dealId: string, @Body() body: any) {
    return this.support.createDealItem(dealId, body);
  }

  @RequirePermissions('deals.edit')
  @Patch('deals/:dealId/items/:itemId')
  updateDealItem(@Param('dealId') dealId: string, @Param('itemId') itemId: string, @Body() body: any) {
    return this.support.updateDealItem(dealId, itemId, body);
  }

  @RequirePermissions('deals.edit')
  @Delete('deals/:dealId/items/:itemId')
  deleteDealItem(@Param('dealId') dealId: string, @Param('itemId') itemId: string) {
    return this.support.deleteDealItem(dealId, itemId);
  }

  @RequirePermissions('payments.view')
  @Get('payments')
  payments(@Query() query: any) {
    return this.support.payments(query);
  }

  @RequirePermissions('payments.view')
  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.support.payment(id);
  }

  @RequirePermissions('payments.create')
  @Post('payments')
  createPayment(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.support.createPayment(body, req.user);
  }

  @RequirePermissions('installations.view')
  @Get('installations')
  installations(@Query() query: any) {
    return this.support.installations(query);
  }

  @RequirePermissions('installations.view')
  @Get('installations/:id')
  installation(@Param('id') id: string) {
    return this.support.installation(id);
  }

  @RequirePermissions('installations.create')
  @Post('installations')
  createInstallation(@Body() body: any) {
    return this.support.createInstallation(body);
  }

  @RequirePermissions('installations.edit')
  @Patch('installations/:id')
  updateInstallation(@Param('id') id: string, @Body() body: any) {
    return this.support.updateInstallation(id, body);
  }

  @RequirePermissions('customers.view')
  @Get('messages')
  messages(@Query('customerId') customerId: string) {
    return this.support.messages(customerId);
  }

  @RequirePermissions('customers.edit')
  @Post('messages')
  createMessage(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.support.createMessage(body, req.user);
  }

  @RequirePermissions('dashboard.view')
  @Get('search')
  search(@Query('q') q = '') {
    return this.support.search(q);
  }

  @RequirePermissions('dashboard.view')
  @Get('notifications')
  notifications() {
    return { items: [], total: 0 };
  }

  @RequirePermissions('dashboard.view')
  @Get('notifications/unread-count')
  unreadCount() {
    return { count: 0 };
  }

  @RequirePermissions('dashboard.view')
  @Post('notifications/:id/read')
  markRead() {
    return { ok: true };
  }

  @RequirePermissions('dashboard.view')
  @Post('notifications/mark-all-read')
  markAllRead() {
    return { ok: true };
  }

  @RequirePermissions('dashboard.view')
  @Get('timeline')
  timeline() {
    return { items: [] };
  }

  @RequirePermissions('dashboard.view')
  @Get('activities')
  activities() {
    return { items: [], total: 0 };
  }

  @RequirePermissions('dashboard.view')
  @Post('activities')
  createActivity(@Body() body: any, @Req() req: Request & { user?: any }) {
    return { id: `activity-${Date.now()}`, employeeName: req.user.name, createdAt: new Date().toISOString(), date: body.date || new Date().toISOString(), ...body };
  }

  @RequirePermissions('dashboard.view')
  @Get('comments')
  comments() {
    return { items: [], total: 0 };
  }

  @RequirePermissions('comments.create')
  @Post('comments')
  createComment(@Body() body: any, @Req() req: Request & { user?: any }) {
    return { id: `comment-${Date.now()}`, author: { id: req.user.id, name: req.user.name }, createdAt: new Date().toISOString(), ...body };
  }

  @RequirePermissions('attachments.create')
  @Get('attachments')
  attachments() {
    return { items: [], total: 0 };
  }
}
