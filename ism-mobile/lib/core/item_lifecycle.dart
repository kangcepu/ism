import 'package:flutter/material.dart';

import 'app_theme.dart';

/// Status/condition vocabulary for items - mirrors the labels/order used by
/// the web app's Items module (STATUS_META / CONDITION_LABELS in
/// js/modules/items-module.js) so both platforms read the same lifecycle the
/// same way.
const statusOrder = ['available', 'in_use', 'maintenance', 'retired', 'disposed'];

const statusMeta = {
  'available': ('Available', AppColors.green, Icons.inventory_2_outlined),
  'in_use': ('In Use', AppColors.blue, Icons.person_outline_rounded),
  'maintenance': ('Maintenance', AppColors.amber, Icons.build_outlined),
  'retired': ('Retired', AppColors.textMuted, Icons.archive_outlined),
  'disposed': ('Disposed', AppColors.red, Icons.delete_outline_rounded),
};

const conditionOrder = ['new', 'good', 'fair', 'poor', 'broken'];

const conditionLabels = {
  'new': 'Baru',
  'good': 'Baik',
  'fair': 'Cukup',
  'poor': 'Kurang',
  'broken': 'Rusak',
};

(String, Color, IconData) statusMetaFor(String status) =>
    statusMeta[status] ?? ('Unknown', AppColors.textMuted, Icons.help_outline_rounded);
