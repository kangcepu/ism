import { Module } from "@nestjs/common";
import { CategoriesController, CustomFieldsController, ItemTypesController, LocationsController } from "./master.controller";
@Module({ controllers: [CategoriesController, LocationsController, CustomFieldsController, ItemTypesController] })
export class MasterModule {}
