import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { GroupsModule } from '../groups/groups.module';
import { PartnersController } from './partners.controller';

@Module({
  imports: [CustomersModule, GroupsModule],
  controllers: [PartnersController],
})
export class PartnersModule {}
