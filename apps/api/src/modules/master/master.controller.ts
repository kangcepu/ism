import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { AdminOnly } from "../../common/auth.decorators";
import { PrismaService } from "../../database/prisma.service";
import { CategoryDto, CustomFieldDto, LocationDto } from "./master.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly db: PrismaService) {}
  @Get() list() { return this.db.category.findMany({ where: { deletedAt: null }, orderBy: [{ itemType: "asc" }, { name: "asc" }] }); }
  @Get("grouped") async grouped() { const rows = await this.list(); return Object.values(rows.reduce<Record<string, { itemType: string; categories: typeof rows }>>((a, r) => { (a[r.itemType] ||= { itemType: r.itemType, categories: [] }).categories.push(r); return a; }, {})); }
  @Get(":id") detail(@Param("id", ParseIntPipe) id: number) { return this.db.category.findFirstOrThrow({ where: { id, deletedAt: null } }); }
  @AdminOnly() @Post() create(@Body() dto: CategoryDto) { return this.db.category.create({ data: dto }); }
  @AdminOnly() @Patch(":id") update(@Param("id", ParseIntPipe) id: number, @Body() dto: CategoryDto) { return this.db.category.update({ where: { id }, data: dto }); }
  @AdminOnly() @Delete(":id") remove(@Param("id", ParseIntPipe) id: number) { return this.db.category.update({ where: { id }, data: { deletedAt: new Date() } }); }
}
@Controller("item-types")
export class ItemTypesController { constructor(private readonly db: PrismaService) {} @Get() async list() { const rows = await this.db.category.findMany({ where: { deletedAt: null }, distinct: ["itemType"], select: { itemType: true }, orderBy: { itemType: "asc" } }); return rows.map((r) => r.itemType); } }
@Controller("locations")
export class LocationsController {
  constructor(private readonly db: PrismaService) {}
  @Get() list() { return this.db.location.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }); }
  @Get(":id") detail(@Param("id", ParseIntPipe) id: number) { return this.db.location.findFirstOrThrow({ where: { id, deletedAt: null } }); }
  @AdminOnly() @Post() create(@Body() dto: LocationDto) { return this.db.location.create({ data: dto }); }
  @AdminOnly() @Patch(":id") update(@Param("id", ParseIntPipe) id: number, @Body() dto: LocationDto) { return this.db.location.update({ where: { id }, data: dto }); }
  @AdminOnly() @Delete(":id") remove(@Param("id", ParseIntPipe) id: number) { return this.db.location.update({ where: { id }, data: { deletedAt: new Date() } }); }
}
@Controller("custom-fields")
export class CustomFieldsController {
  constructor(private readonly db: PrismaService) {}
  @Get() list() { return this.db.customField.findMany({ where: { deletedAt: null }, orderBy: { fieldLabel: "asc" } }); }
  @AdminOnly() @Post() create(@Body() dto: CustomFieldDto) { return this.db.customField.create({ data: dto }); }
  @AdminOnly() @Patch(":id") update(@Param("id", ParseIntPipe) id: number, @Body() dto: CustomFieldDto) { return this.db.customField.update({ where: { id }, data: dto }); }
  @AdminOnly() @Delete(":id") remove(@Param("id", ParseIntPipe) id: number) { return this.db.customField.update({ where: { id }, data: { deletedAt: new Date() } }); }
}
