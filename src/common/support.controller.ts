import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../permissions/public.decorator';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { SupportService } from './support.service';
import { ROLE_DEFAULT_PERMISSIONS } from './defaults';

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
    return {
      items: ['ADMIN', 'EMPLOYEE'].map((name) => ({ id: name, name, permissions: ROLE_DEFAULT_PERMISSIONS[name] })),
      total: 2,
    };
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
  customerOptions(@Req() req: Request & { user?: any }) {
    return this.support.customerOptions(req.user);
  }

  @RequirePermissions('customers.view')
  @Get('business-types')
  businessTypes(@Req() req: Request & { user?: any }) {
    return this.support.businessTypes(req.user);
  }

  @RequirePermissions('settings.edit')
  @Post('business-types')
  createBusinessType(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.support.createBusinessType(body, req.user);
  }

  @RequirePermissions('settings.edit')
  @Delete('business-types/:id')
  deleteBusinessType(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.support.deleteBusinessType(id, req.user);
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

  @RequirePermissions('programs.view')
  @Get('program-catalog')
  programCatalog(@Query() query: any) {
    return this.support.programCatalog(query);
  }

  @RequirePermissions('programs.create')
  @Post('program-catalog')
  createProgram(@Body() body: any) {
    return this.support.createProgram(body);
  }

  @RequirePermissions('programs.edit')
  @Patch('program-catalog/:id')
  updateProgram(@Param('id') id: string, @Body() body: any) {
    return this.support.updateProgram(id, body);
  }

  @RequirePermissions('programs.delete')
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
  leads(@Query() query: any, @Req() req: Request & { user?: any }) {
    return this.support.leads(query, req.user);
  }

  @RequirePermissions('leads.view')
  @Get('leads/:id')
  lead(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.support.lead(id, req.user);
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
  deals(@Query() query: any, @Req() req: Request & { user?: any }) {
    return this.support.deals(query, req.user);
  }

  @RequirePermissions('deals.view')
  @Get('deals/:id')
  deal(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.support.deal(id, req.user);
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
  dealItems(@Param('dealId') dealId: string, @Req() req: Request & { user?: any }) {
    return this.support.dealItems(dealId, req.user);
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
  payments(@Query() query: any, @Req() req: Request & { user?: any }) {
    return this.support.payments(query, req.user);
  }

  @RequirePermissions('payments.view')
  @Get('payments/:id')
  payment(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.support.payment(id, req.user);
  }

  @RequirePermissions('payments.create')
  @Post('payments')
  createPayment(@Body() body: any, @Req() req: Request & { user?: any }) {
    return this.support.createPayment(body, req.user);
  }

  @RequirePermissions('customers.view')
  @Get('messages')
  messages(@Query('customerId') customerId: string, @Req() req: Request & { user?: any }) {
    return this.support.messages(customerId, req.user);
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

  @RequirePermissions('attachments.create')
  @Get('attachments')
  attachments() {
    return { items: [], total: 0 };
  }
}
