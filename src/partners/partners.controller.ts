import { Controller, Get, Query, Req, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { CustomersService } from '../customers/customers.service';
import { GroupsService } from '../groups/groups.service';
import { isPartner } from '../common/access';

type AuthRequest = Request & { user?: any };

@Controller('partners/me')
export class PartnersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly groups: GroupsService,
  ) {}

  @RequirePermissions('customers.view')
  @Get('customers')
  customersList(@Query() query: any, @Req() req: AuthRequest) {
    if (!isPartner(req.user)) throw new ForbiddenException('Bu endpoint faqat Partner uchun');
    return this.customers.list(query, req.user);
  }

  @RequirePermissions('customers.view')
  @Get('statistics')
  statistics(@Query() query: any, @Req() req: AuthRequest) {
    if (!isPartner(req.user)) throw new ForbiddenException('Bu endpoint faqat Partner uchun');
    const groupId = req.user?.partnerGroupId;
    if (!groupId) throw new ForbiddenException('Partner guruhi biriktirilmagan');
    return this.groups.partnerSummary(groupId, query, req.user);
  }
}
