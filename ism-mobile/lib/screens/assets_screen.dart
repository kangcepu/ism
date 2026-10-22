import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../core/item_lifecycle.dart';
import '../models/asset.dart';
import '../services/assets_service.dart';
import '../widgets/loading_skeleton.dart';
import 'asset_detail_screen.dart';
import 'asset_form_screen.dart';

class AssetsScreen extends StatefulWidget {
  const AssetsScreen({super.key, required this.service, required this.isAdmin});
  final AssetsService service;
  final bool isAdmin;

  @override
  State<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends State<AssetsScreen> {
  final _search = TextEditingController();
  final _scrollController = ScrollController();
  final _assets = <Asset>[];
  var _categories = <AssetCategory>[];
  Timer? _searchDebounce;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasNext = false;
  int _page = 1;
  int _total = 0;
  int? _categoryId;
  bool _fromCache = false;
  DateTime? _cachedAt;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_loadMoreIfNeeded);
    _loadCategories();
    _load(reset: true);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _search.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String _) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(
      const Duration(milliseconds: 300),
      () => _load(reset: true),
    );
  }

  void _loadMoreIfNeeded() {
    if (_scrollController.position.extentAfter < 260) _load(reset: false);
  }

  Future<void> _loadCategories() async {
    try {
      final options = await widget.service.fetchOptions();
      if (mounted) setState(() => _categories = options.categories);
    } catch (_) {
      // Asset list remains usable if category options are unavailable.
    }
  }

  void _selectCategory(int? categoryId) {
    if (_categoryId == categoryId) return;
    setState(() => _categoryId = categoryId);
    _load(reset: true);
  }

  Future<void> _load({required bool reset}) async {
    if (_isLoadingMore || (!reset && (!_hasNext || _isLoading))) return;
    final requestedPage = reset ? 1 : _page + 1;
    setState(() {
      if (reset) {
        _isLoading = true;
        _error = null;
      } else {
        _isLoadingMore = true;
      }
    });
    try {
      final result = await widget.service.fetchAssets(
        query: _search.text.trim(),
        categoryId: _categoryId,
        page: requestedPage,
      );
      if (!mounted) return;
      final mergedAssets = reset
          ? result.assets
          : [..._assets, ...result.assets];
      setState(() {
        _assets
          ..clear()
          ..addAll(mergedAssets);
        _page = result.page;
        _total = result.total;
        _hasNext = result.hasNext;
        _fromCache = result.fromCache;
        _cachedAt = result.cachedAt;
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _openAddAsset() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => AssetFormScreen(service: widget.service),
      ),
    );
    if (changed == true) await _load(reset: true);
  }

  Future<void> _openDetail(Asset asset) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => AssetDetailScreen(
          service: widget.service,
          asset: asset,
          isAdmin: widget.isAdmin,
        ),
      ),
    );
    if (mounted) await _load(reset: true);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.transparent,
    floatingActionButton: widget.isAdmin
        ? FloatingActionButton.extended(
            onPressed: _openAddAsset,
            backgroundColor: AppColors.blue,
            foregroundColor: Colors.white,
            icon: const Icon(Icons.add_rounded),
            label: const Text(
              'Tambah aset',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          )
        : null,
    body: SafeArea(
      child: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: CustomScrollView(
          controller: _scrollController,
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'MANAGEMENT ASSETS',
                      style: TextStyle(
                        color: AppColors.cyan,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 5),
                    const Text(
                      'Aset',
                      style: TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      _isLoading
                          ? 'Memuat data aset...'
                          : _fromCache
                          ? '$_total aset tersimpan • Offline'
                          : '$_total aset terdaftar',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                    if (_fromCache) ...[
                      const SizedBox(height: 7),
                      Text(
                        'Menampilkan cache ${_cachedAt == null ? 'terakhir' : 'dari ${_cachedAt!.toLocal().toString().substring(0, 16)}'}',
                        style: const TextStyle(
                          color: AppColors.amber,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    TextField(
                      controller: _search,
                      onChanged: _onSearchChanged,
                      decoration: InputDecoration(
                        hintText: 'Cari nama, kode, serial, atau pengguna...',
                        prefixIcon: const Icon(Icons.search_rounded),
                        suffixIcon: _search.text.isEmpty
                            ? null
                            : IconButton(
                                onPressed: () {
                                  _search.clear();
                                  _load(reset: true);
                                  setState(() {});
                                },
                                icon: const Icon(Icons.close_rounded),
                              ),
                      ),
                    ),
                    if (_categories.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _CategoryFilterChip(
                              label: 'Semua',
                              selected: _categoryId == null,
                              onTap: () => _selectCategory(null),
                            ),
                            ..._categories.map(
                              (category) => _CategoryFilterChip(
                                label: category.name ?? 'Tanpa kategori',
                                selected: _categoryId == category.id,
                                onTap: () => _selectCategory(category.id),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            if (_isLoading)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 18),
                sliver: SliverList.separated(
                  itemCount: 5,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, _) => const LoadingSkeleton(height: 108),
                ),
              )
            else if (_error != null)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _AssetsMessage(
                  icon: Icons.cloud_off_rounded,
                  title: 'Aset tidak dapat dimuat',
                  message: _error!,
                  onRetry: () => _load(reset: true),
                ),
              )
            else if (_assets.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _AssetsMessage(
                  icon: Icons.inventory_2_outlined,
                  title: 'Belum ada aset',
                  message: 'Ubah kata pencarian atau tambahkan aset baru.',
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 96),
                sliver: SliverList.separated(
                  itemCount: _assets.length + (_isLoadingMore ? 1 : 0),
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    if (index == _assets.length) {
                      return const Padding(
                        padding: EdgeInsets.all(12),
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    final asset = _assets[index];
                    return _AssetCard(
                      asset: asset,
                      onTap: () => _openDetail(asset),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class _CategoryFilterChip extends StatelessWidget {
  const _CategoryFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
      selectedColor: AppColors.blue.withValues(alpha: .24),
      side: const BorderSide(color: AppColors.border),
      labelStyle: TextStyle(
        color: selected ? AppColors.cyan : AppColors.textMuted,
        fontSize: 11,
        fontWeight: FontWeight.w700,
      ),
      showCheckmark: false,
    ),
  );
}

class _AssetCard extends StatelessWidget {
  const _AssetCard({required this.asset, required this.onTap});
  final Asset asset;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.blue.withValues(alpha: .14),
                borderRadius: BorderRadius.circular(13),
              ),
              child: const Icon(
                Icons.inventory_2_outlined,
                color: AppColors.cyan,
              ),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    asset.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    asset.code,
                    style: const TextStyle(
                      color: AppColors.cyan,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    [
                      asset.category.itemType,
                      asset.location.name,
                    ].whereType<String>().join(' • '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      _StatusDot(status: asset.status),
                      const SizedBox(width: 5),
                      Text(
                        statusMetaFor(asset.status).$1,
                        style: TextStyle(
                          color: statusMetaFor(asset.status).$2,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (asset.assigneeName != null) ...[
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            asset.assigneeName!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 10.5,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
          ],
        ),
      ),
    ),
  );
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) => Container(
    width: 7,
    height: 7,
    decoration: BoxDecoration(
      color: statusMetaFor(status).$2,
      shape: BoxShape.circle,
    ),
  );
}

class _AssetsMessage extends StatelessWidget {
  const _AssetsMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.onRetry,
  });
  final IconData icon;
  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: AppColors.textMuted),
          const SizedBox(height: 14),
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 5),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
          if (onRetry != null) ...[
            const SizedBox(height: 14),
            TextButton(onPressed: onRetry, child: const Text('Coba lagi')),
          ],
        ],
      ),
    ),
  );
}
