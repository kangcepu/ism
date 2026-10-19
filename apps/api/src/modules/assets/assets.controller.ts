import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from "@nestjs/common";
import { Actor } from "../../common/auth.decorators";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../database/prisma.service";
import { AssetQuery, AssignAssetDto, CreateAssetDto, TransitionDto, UpdateAssetDto } from "./assets.dto";
import { AssetsService } from "./assets.service";

@Controller("assets")
export class AssetsController {
  constructor(private readonly assets: AssetsService, private readonly db: PrismaService) {}
  @Get() list(@Query() query: AssetQuery) { return this.assets.list(query); }
  @Get("summary-by-type") async summary() { return this.db.category.findMany({ where: { deletedAt: null }, distinct: ["itemType"], select: { itemType: true, _count: { select: { assets: { where: { deletedAt: null } } } } } }); }
  @Get(":id") detail(@Param("id", ParseIntPipe) id: number) { return this.assets.detail(id); }
  @Post() create(@Body() dto: CreateAssetDto, @Actor() actor: RequestUser) { return this.assets.create(dto, actor); }
  @Patch(":id") update(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateAssetDto, @Actor() actor: RequestUser) { return this.assets.update(id, dto, actor); }
  @Delete(":id") remove(@Param("id", ParseIntPipe) id: number, @Actor() actor: RequestUser) { return this.assets.remove(id, actor); }
  @Get(":id/history") history(@Param("id", ParseIntPipe) id: number) { return this.db.assetHistory.findMany({ where: { assetId: id }, orderBy: { createdAt: "desc" } }); }
  @Post(":id/assignments") assign(@Param("id", ParseIntPipe) id: number, @Body() dto: AssignAssetDto, @Actor() actor: RequestUser) { return this.assets.assign(id, dto, actor); }
  @Post(":id/check-in") checkIn(@Param("id", ParseIntPipe) id: number, @Actor() actor: RequestUser) { return this.assets.checkIn(id, actor); }
  @Post(":id/status-transitions") transition(@Param("id", ParseIntPipe) id: number, @Body() dto: TransitionDto, @Actor() actor: RequestUser) { return this.assets.transition(id, dto, actor); }
}

@Controller("mobile/assets")
export class MobileAssetsController extends AssetsController {
  constructor(assets: AssetsService, db: PrismaService) { super(assets, db); }
}
