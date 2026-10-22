import 'package:flutter/material.dart';

import '../core/app_theme.dart';

Color statusColor(String status) => switch (status) {
  'online' => AppColors.green,
  'degraded' => AppColors.amber,
  'offline' => AppColors.red,
  _ => AppColors.textMuted,
};

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status, this.compact = false});
  final String status;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 4 : 5,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            status[0].toUpperCase() + status.substring(1),
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w700,
              fontSize: compact ? 10 : 11,
            ),
          ),
        ],
      ),
    );
  }
}
