import 'package:flutter/material.dart';

import '../controllers/session_controller.dart';
import '../core/app_theme.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key, required this.session});
  final SessionController session;

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirmPassword = TextEditingController();
  bool _showCurrentPassword = false;
  bool _showNewPassword = false;
  bool _showConfirmPassword = false;
  String? _successMessage;

  @override
  void dispose() {
    _currentPassword.dispose();
    _newPassword.dispose();
    _confirmPassword.dispose();
    super.dispose();
  }

  Future<void> _changePassword() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;
    setState(() => _successMessage = null);
    final changed = await widget.session.changePassword(
      currentPassword: _currentPassword.text,
      newPassword: _newPassword.text,
      confirmPassword: _confirmPassword.text,
    );
    if (!mounted || !changed) return;
    _currentPassword.clear();
    _newPassword.clear();
    _confirmPassword.clear();
    setState(() => _successMessage = 'Password berhasil diubah.');
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: ListenableBuilder(
      listenable: widget.session,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const SizedBox(height: 12),
          Text(
            widget.session.user?.fullName ?? '-',
            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 30),
          const Text(
            'KEAMANAN',
            style: TextStyle(
              color: AppColors.cyan,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Ubah password',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 16),
          Form(
            key: _formKey,
            child: Column(
              children: [
                _PasswordField(
                  controller: _currentPassword,
                  label: 'Current Password',
                  visible: _showCurrentPassword,
                  enabled: !widget.session.isBusy,
                  onVisibilityChanged: () => setState(
                    () => _showCurrentPassword = !_showCurrentPassword,
                  ),
                  validator: (value) => value == null || value.isEmpty
                      ? 'Current password wajib diisi.'
                      : null,
                ),
                const SizedBox(height: 12),
                _PasswordField(
                  controller: _newPassword,
                  label: 'New Password',
                  visible: _showNewPassword,
                  enabled: !widget.session.isBusy,
                  onVisibilityChanged: () =>
                      setState(() => _showNewPassword = !_showNewPassword),
                  validator: (value) => value == null || value.length < 8
                      ? 'Password baru minimal 8 karakter.'
                      : null,
                ),
                const SizedBox(height: 12),
                _PasswordField(
                  controller: _confirmPassword,
                  label: 'Confirm Password',
                  visible: _showConfirmPassword,
                  enabled: !widget.session.isBusy,
                  onVisibilityChanged: () => setState(
                    () => _showConfirmPassword = !_showConfirmPassword,
                  ),
                  validator: (value) => value != _newPassword.text
                      ? 'Konfirmasi password belum cocok.'
                      : null,
                ),
                if (widget.session.error != null) ...[
                  const SizedBox(height: 12),
                  _MessageBox(
                    message: widget.session.error!,
                    color: AppColors.red,
                  ),
                ],
                if (_successMessage != null) ...[
                  const SizedBox(height: 12),
                  _MessageBox(
                    message: _successMessage!,
                    color: AppColors.green,
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: widget.session.isBusy ? null : _changePassword,
                  icon: widget.session.isBusy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.lock_reset_rounded),
                  label: const Text('Simpan password baru'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 36),
          OutlinedButton.icon(
            onPressed: widget.session.isBusy ? null : widget.session.logout,
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Keluar dari aplikasi'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.red,
              side: BorderSide(color: AppColors.red.withValues(alpha: .45)),
              minimumSize: const Size.fromHeight(50),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _PasswordField extends StatelessWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.visible,
    required this.enabled,
    required this.onVisibilityChanged,
    required this.validator,
  });

  final TextEditingController controller;
  final String label;
  final bool visible;
  final bool enabled;
  final VoidCallback onVisibilityChanged;
  final FormFieldValidator<String> validator;

  @override
  Widget build(BuildContext context) => TextFormField(
    controller: controller,
    enabled: enabled,
    obscureText: !visible,
    autofillHints: label == 'Current Password'
        ? const [AutofillHints.password]
        : const [AutofillHints.newPassword],
    textInputAction: TextInputAction.next,
    decoration: InputDecoration(
      labelText: label,
      prefixIcon: const Icon(Icons.lock_outline_rounded),
      suffixIcon: IconButton(
        tooltip: visible ? 'Sembunyikan password' : 'Tampilkan password',
        onPressed: enabled ? onVisibilityChanged : null,
        icon: Icon(
          visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        ),
      ),
    ),
    validator: validator,
  );
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({required this.message, required this.color});
  final String message;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: color.withValues(alpha: .35)),
    ),
    child: Text(message, style: TextStyle(color: color, fontSize: 12)),
  );
}
