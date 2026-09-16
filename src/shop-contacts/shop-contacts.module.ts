import { Module } from '@nestjs/common';
import { ShopContactsController } from './shop-contacts.controller';
import { ShopContactsService } from './shop-contacts.service';
import { FlowAccountModule } from '../flowaccount/flowaccount.module';

@Module({
  imports: [FlowAccountModule],
  controllers: [ShopContactsController],
  providers: [ShopContactsService],
  exports: [ShopContactsService],
})
export class ShopContactsModule {}
