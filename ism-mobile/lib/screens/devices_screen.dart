import 'package:flutter/material.dart';

import '../controllers/monitoring_controller.dart';
import '../core/app_theme.dart';
import '../services/monitoring_service.dart';
import '../widgets/device_card.dart';
import '../widgets/loading_skeleton.dart';
import 'device_detail_screen.dart';
import 'device_form_screen.dart';

class DevicesScreen extends StatefulWidget {
  const DevicesScreen({
    super.key,
    required this.controller,
    required this.service,
    required this.isAdmin,
  });
  final MonitoringController controller;
  final MonitoringService service;
  final bool isAdmin;

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  final _searchController = TextEditingController();
  String _status = 'all';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _openForm() async {
    final changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => DeviceFormScreen(service: widget.service),
      ),
    );
    if (changed == true) widget.controller.refresh();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final devices = widget.controller.filtered(
            query: _searchController.text,
            status: _status,
          );
          return Scaffold(
            backgroundColor: Colors.transparent,
            floatingActionButton: widget.isAdmin
                ? FloatingActionButton.extended(
                    onPressed: _openForm,
                    backgroundColor: AppColors.blue,
                    foregroundColor: Colors.white,
                    icon: const Icon(Icons.add_rounded),
                    label: const Text(
                      'Tambah',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                  )
                : null,
            body: RefreshIndicator(
              onRefresh: widget.controller.refresh,
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  const SliverPadding(
                    padding: EdgeInsets.fromLTRB(18, 18, 18, 14),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'SWITCH INVENTORY',
                            style: TextStyle(
                              color: AppColors.cyan,
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.5,
                            ),
                          ),
                          SizedBox(height: 5),
                          Text(
                            'Devices',
                            style: TextStyle(
                              fontSize: 23,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    sliver: SliverToBoxAdapter(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: 'Cari nama, IP, atau lokasi...',
                          prefixIcon: const Icon(Icons.search_rounded),
                          suffixIcon: _searchController.text.isEmpty
                              ? null
                              : IconButton(
                                  onPressed: () =>
                                      setState(_searchController.clear),
                                  icon: const Icon(Icons.close_rounded),
                                ),
                        ),
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(18, 12, 18, 14),
                    sliver: SliverToBoxAdapter(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            _FilterChip(
                              label: 'Semua',
                              value: 'all',
                              selected: _status,
                              onSelected: (value) =>
                                  setState(() => _status = value),
                            ),
                            _FilterChip(
                              label: 'Online',
                              value: 'online',
                              selected: _status,
                              onSelected: (value) =>
                                  setState(() => _status = value),
                            ),
                            _FilterChip(
                              label: 'Attention',
                              value: 'attention',
                              selected: _status,
                              onSelected: (value) =>
                                  setState(() => _status = value),
                            ),
                            _FilterChip(
                              label: 'Offline',
                              value: 'offline',
                              selected: _status,
                              onSelected: (value) =>
                                  setState(() => _status = value),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (widget.controller.isInitialLoading)
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 18),
                      sliver: SliverList.separated(
                        itemCount: 5,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (_, _) =>
                            const LoadingSkeleton(height: 158),
                      ),
                    )
                  else if (devices.isEmpty)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: _EmptyDevices(),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(18, 0, 18, 96),
                      sliver: SliverList.separated(
                        itemCount: devices.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, index) => DeviceCard(
                          device: devices[index],
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => DeviceDetailScreen(
                                device: devices[index],
                                service: widget.service,
                                isAdmin: widget.isAdmin,
                                onChanged: widget.controller.refresh,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onSelected,
  });
  final String label;
  final String value;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      label: Text(label),
      selected: selected == value,
      onSelected: (_) => onSelected(value),
      selectedColor: AppColors.blue.withValues(alpha: .24),
      side: const BorderSide(color: AppColors.border),
      labelStyle: TextStyle(
        color: selected == value ? AppColors.cyan : AppColors.textMuted,
        fontSize: 11,
        fontWeight: FontWeight.w700,
      ),
      showCheckmark: false,
    ),
  );
}

class _EmptyDevices extends StatelessWidget {
  const _EmptyDevices();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.search_off_rounded, size: 48, color: AppColors.textMuted),
          SizedBox(height: 14),
          Text(
            'Tidak ada perangkat',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          SizedBox(height: 5),
          Text(
            'Ubah kata pencarian atau filter status.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.textMuted, fontSize: 11),
          ),
        ],
      ),
    ),
  );
}
