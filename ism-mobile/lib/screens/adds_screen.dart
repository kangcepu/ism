import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../models/adds_directory.dart';
import '../services/adds_service.dart';

class AddsScreen extends StatefulWidget {
  const AddsScreen({super.key, required this.service});
  final AddsService service;

  @override
  State<AddsScreen> createState() => _AddsScreenState();
}

class _AddsScreenState extends State<AddsScreen> {
  late Future<List<AddsDirectoryService>> _services = widget.service
      .fetchServices();

  void _reload() => setState(() => _services = widget.service.fetchServices());

  Future<void> _addService() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddsServiceForm(service: widget.service),
    );
    if (created == true) _reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('ADDS Management')),
    floatingActionButton: FloatingActionButton.extended(
      onPressed: _addService,
      icon: const Icon(Icons.add_business_rounded),
      label: const Text('Tambah ADDS'),
    ),
    body: FutureBuilder<List<AddsDirectoryService>>(
      future: _services,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _ErrorView(
            message: _message(snapshot.error),
            onRetry: _reload,
          );
        }
        final services = snapshot.data ?? const [];
        if (services.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Text(
                'Belum ada domain ADDS. Tambahkan koneksi Domain Controller terlebih dahulu.',
                textAlign: TextAlign.center,
              ),
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: services.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final service = services[index];
              return Card(
                child: ListTile(
                  leading: const CircleAvatar(
                    child: Icon(Icons.domain_rounded),
                  ),
                  title: Text(
                    service.domainName.isEmpty
                        ? service.name
                        : service.domainName,
                  ),
                  subtitle: Text(
                    '${service.host}:${service.port} • ${service.securityLabel}\n${service.baseDn}',
                  ),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => AddsDirectoryScreen(
                        service: widget.service,
                        directory: service,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        );
      },
    ),
  );
}

class AddsDirectoryScreen extends StatefulWidget {
  const AddsDirectoryScreen({
    super.key,
    required this.service,
    required this.directory,
  });
  final AddsService service;
  final AddsDirectoryService directory;

  @override
  State<AddsDirectoryScreen> createState() => _AddsDirectoryScreenState();
}

class _AddsDirectoryScreenState extends State<AddsDirectoryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);
  List<AddsOu> _ous = const [];
  List<AddsDirectoryUser> _users = const [];
  List<AddsGroup> _groups = const [];
  List<AddsComputer> _computers = const [];
  late String _selectedDn = widget.directory.baseDn;
  bool _loading = true;
  bool _mutating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabs.addListener(() => setState(() {}));
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final ous = await widget.service.fetchOus(widget.directory.id);
      final results = await Future.wait([
        widget.service.fetchUsers(widget.directory.id, _selectedDn),
        widget.service.fetchGroups(widget.directory.id, _selectedDn),
        widget.service.fetchComputers(widget.directory.id, _selectedDn),
      ]);
      if (!mounted) return;
      setState(() {
        _ous = ous;
        _users = results[0] as List<AddsDirectoryUser>;
        _groups = results[1] as List<AddsGroup>;
        _computers = results[2] as List<AddsComputer>;
      });
    } on ApiException catch (error) {
      _error = error.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_mutating) return;
    setState(() => _mutating = true);
    try {
      await action();
      await _load();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _create() async {
    final current = _tabs.index;
    if (current == 3) return;
    final value = await showModalBottomSheet<_DirectoryCreateValue>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _DirectoryCreateForm(
        kind: current,
        groups: _groups,
        selectedDn: _selectedDn,
      ),
    );
    if (value == null) return;
    await _run(() {
      switch (value.kind) {
        case 0:
          return widget.service.createOu(
            widget.directory.id,
            value.name,
            _selectedDn,
          );
        case 1:
          return widget.service.createUser(
            serviceId: widget.directory.id,
            ouDn: _selectedDn,
            username: value.username!,
            displayName: value.name,
            password: value.password!,
            email: value.email,
            groupDn: value.groupDn,
          );
        default:
          return widget.service.createGroup(
            widget.directory.id,
            value.name,
            _selectedDn,
          );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final optionOus = [
      AddsOu(name: 'Root domain', dn: widget.directory.baseDn),
      ..._ous,
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.directory.domainName),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'OU'),
            Tab(text: 'User'),
            Tab(text: 'Group'),
            Tab(text: 'PC'),
          ],
        ),
      ),
      floatingActionButton: _tabs.index == 3
          ? null
          : FloatingActionButton.extended(
              onPressed: _mutating ? null : _create,
              icon: const Icon(Icons.add_rounded),
              label: Text(
                ['Tambah OU', 'Tambah User', 'Tambah Group'][_tabs.index],
              ),
            ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: DropdownButtonFormField<String>(
              initialValue: _selectedDn,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Organizational Unit',
              ),
              items: optionOus
                  .map(
                    (ou) => DropdownMenuItem(
                      value: ou.dn,
                      child: Text(ou.name, overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: _loading
                  ? null
                  : (value) {
                      if (value == null || value == _selectedDn) return;
                      setState(() => _selectedDn = value);
                      _load();
                    },
            ),
          ),
          if (_error != null) _ErrorView(message: _error!, onRetry: _load),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_error == null)
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _OuList(ous: _ous),
                  _UserList(
                    users: _users,
                    onToggle: (user, enabled) => _run(
                      () => widget.service.setUserEnabled(
                        widget.directory.id,
                        user.dn,
                        enabled,
                      ),
                    ),
                  ),
                  _GroupList(
                    groups: _groups,
                    onOpen: (group) => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => AddsGroupMembersScreen(
                          service: widget.service,
                          directory: widget.directory,
                          group: group,
                          candidates: _users,
                        ),
                      ),
                    ),
                  ),
                  _ComputerList(computers: _computers),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AddsServiceForm extends StatefulWidget {
  const _AddsServiceForm({required this.service});
  final AddsService service;
  @override
  State<_AddsServiceForm> createState() => _AddsServiceFormState();
}

class _AddsServiceFormState extends State<_AddsServiceForm> {
  final _form = GlobalKey<FormState>();
  final _domain = TextEditingController();
  final _host = TextEditingController();
  final _admin = TextEditingController();
  final _password = TextEditingController();
  String _security = 'tls';
  bool _saving = false;

  @override
  void dispose() {
    _domain.dispose();
    _host.dispose();
    _admin.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await widget.service.createService(
        domainName: _domain.text.trim(),
        host: _host.text.trim(),
        adminUsername: _admin.text.trim(),
        adminPassword: _password.text,
        security: _security,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Form(
        key: _form,
        child: ListView(
          shrinkWrap: true,
          children: [
            const Text(
              'Hubungkan Active Directory',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Base DN dan nama service dibuat otomatis dari nama domain.',
            ),
            const SizedBox(height: 18),
            _field(_domain, 'Nama domain', 'corp.example.com'),
            _field(
              _host,
              'IP / Host Domain Controller',
              'dc01.corp.example.com',
            ),
            _field(
              _admin,
              'User Domain Admin',
              'administrator atau administrator@corp.example.com',
            ),
            _field(_password, 'Password Domain Admin', '', obscure: true),
            DropdownButtonFormField<String>(
              initialValue: _security,
              decoration: const InputDecoration(labelText: 'Koneksi aman'),
              items: const [
                DropdownMenuItem(
                  value: 'tls',
                  child: Text('STARTTLS (port 389)'),
                ),
                DropdownMenuItem(value: 'ssl', child: Text('LDAPS (port 636)')),
              ],
              onChanged: (value) => setState(() => _security = value ?? 'tls'),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _saving ? null : _save,
              icon: const Icon(Icons.link_rounded),
              label: Text(
                _saving ? 'Menguji koneksi...' : 'Hubungkan & Kelola ADDS',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _DirectoryCreateValue {
  const _DirectoryCreateValue({
    required this.kind,
    required this.name,
    this.username,
    this.password,
    this.email,
    this.groupDn,
  });
  final int kind;
  final String name;
  final String? username;
  final String? password;
  final String? email;
  final String? groupDn;
}

class _DirectoryCreateForm extends StatefulWidget {
  const _DirectoryCreateForm({
    required this.kind,
    required this.groups,
    required this.selectedDn,
  });
  final int kind;
  final List<AddsGroup> groups;
  final String selectedDn;
  @override
  State<_DirectoryCreateForm> createState() => _DirectoryCreateFormState();
}

class _DirectoryCreateFormState extends State<_DirectoryCreateForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _email = TextEditingController();
  String? _groupDn;
  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _password.dispose();
    _email.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_form.currentState!.validate()) return;
    Navigator.of(context).pop(
      _DirectoryCreateValue(
        kind: widget.kind,
        name: _name.text.trim(),
        username: widget.kind == 1 ? _username.text.trim() : null,
        password: widget.kind == 1 ? _password.text : null,
        email: widget.kind == 1 ? _email.text.trim() : null,
        groupDn: _groupDn,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final label = ['OU', 'User', 'Group'][widget.kind];
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Form(
          key: _form,
          child: ListView(
            shrinkWrap: true,
            children: [
              Text(
                'Tambah $label',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 16),
              _field(
                _name,
                widget.kind == 1 ? 'Nama lengkap' : 'Nama $label',
                '',
              ),
              if (widget.kind == 1) ...[
                _field(_username, 'Username', 'budi.santoso'),
                _field(_password, 'Password awal', '', obscure: true),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email (opsional)',
                  ),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: _groupDn,
                  decoration: const InputDecoration(
                    labelText: 'Masukkan ke group (opsional)',
                  ),
                  isExpanded: true,
                  items: [
                    const DropdownMenuItem(
                      value: '',
                      child: Text('Tanpa group'),
                    ),
                    ...widget.groups.map(
                      (group) => DropdownMenuItem(
                        value: group.dn,
                        child: Text(group.name),
                      ),
                    ),
                  ],
                  onChanged: (value) => setState(
                    () => _groupDn = value?.isEmpty == true ? null : value,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              FilledButton(onPressed: _submit, child: Text('Simpan $label')),
            ],
          ),
        ),
      ),
    );
  }
}

TextFormField _field(
  TextEditingController controller,
  String label,
  String hint, {
  bool obscure = false,
}) => TextFormField(
  controller: controller,
  obscureText: obscure,
  decoration: InputDecoration(labelText: label, hintText: hint),
  validator: (value) =>
      value?.trim().isEmpty == true ? '$label wajib diisi.' : null,
);

class _OuList extends StatelessWidget {
  const _OuList({required this.ous});
  final List<AddsOu> ous;
  @override
  Widget build(BuildContext context) => ous.isEmpty
      ? const Center(child: Text('Belum ada OU.'))
      : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: ous.length,
          itemBuilder: (_, index) => Card(
            child: ListTile(
              leading: const Icon(
                Icons.account_tree_outlined,
                color: AppColors.cyan,
              ),
              title: Text(ous[index].name),
              subtitle: Text(ous[index].dn),
            ),
          ),
        );
}

class _UserList extends StatelessWidget {
  const _UserList({required this.users, required this.onToggle});
  final List<AddsDirectoryUser> users;
  final Future<void> Function(AddsDirectoryUser, bool) onToggle;
  @override
  Widget build(BuildContext context) => users.isEmpty
      ? const Center(child: Text('Belum ada user langsung pada OU ini.'))
      : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: users.length,
          itemBuilder: (_, index) {
            final user = users[index];
            return Card(
              child: ListTile(
                leading: CircleAvatar(
                  child: Text(
                    user.name.isEmpty ? '?' : user.name[0].toUpperCase(),
                  ),
                ),
                title: Text(user.name),
                subtitle: Text(
                  '${user.username}${user.email?.isNotEmpty == true ? ' • ${user.email}' : ''}',
                ),
                trailing: Switch(
                  value: user.enabled,
                  onChanged: (value) => onToggle(user, value),
                ),
              ),
            );
          },
        );
}

class _GroupList extends StatelessWidget {
  const _GroupList({required this.groups, required this.onOpen});
  final List<AddsGroup> groups;
  final ValueChanged<AddsGroup> onOpen;
  @override
  Widget build(BuildContext context) => groups.isEmpty
      ? const Center(child: Text('Belum ada group langsung pada OU ini.'))
      : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: groups.length,
          itemBuilder: (_, index) => Card(
            child: ListTile(
              leading: const Icon(Icons.group_outlined, color: AppColors.cyan),
              title: Text(groups[index].name),
              subtitle: Text(groups[index].description ?? groups[index].dn),
              trailing: const Icon(Icons.people_outline_rounded),
              onTap: () => onOpen(groups[index]),
            ),
          ),
        );
}

class _ComputerList extends StatelessWidget {
  const _ComputerList({required this.computers});
  final List<AddsComputer> computers;

  @override
  Widget build(BuildContext context) => computers.isEmpty
      ? const Center(child: Text('Belum ada PC langsung pada OU ini.'))
      : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: computers.length,
          itemBuilder: (_, index) {
            final computer = computers[index];
            final system = [
              computer.operatingSystem,
              computer.operatingSystemVersion,
            ].whereType<String>().where((value) => value.isNotEmpty).join(' ');
            return Card(
              child: ListTile(
                leading: Icon(
                  Icons.computer_rounded,
                  color: computer.enabled
                      ? AppColors.cyan
                      : AppColors.textMuted,
                ),
                title: Text(computer.name),
                subtitle: Text(
                  [computer.dnsHostName, system]
                      .whereType<String>()
                      .where((value) => value.isNotEmpty)
                      .join('\n'),
                ),
                isThreeLine: system.isNotEmpty,
              ),
            );
          },
        );
}

class AddsGroupMembersScreen extends StatefulWidget {
  const AddsGroupMembersScreen({
    super.key,
    required this.service,
    required this.directory,
    required this.group,
    required this.candidates,
  });
  final AddsService service;
  final AddsDirectoryService directory;
  final AddsGroup group;
  final List<AddsDirectoryUser> candidates;

  @override
  State<AddsGroupMembersScreen> createState() => _AddsGroupMembersScreenState();
}

class _AddsGroupMembersScreenState extends State<AddsGroupMembersScreen> {
  late Future<List<AddsDirectoryUser>> _members = _load();

  Future<List<AddsDirectoryUser>> _load() =>
      widget.service.fetchGroupMembers(widget.directory.id, widget.group.dn);

  void _reload() => setState(() => _members = _load());

  Future<void> _changeMember(AddsDirectoryUser user, String operation) async {
    try {
      await widget.service.setGroupMembership(
        serviceId: widget.directory.id,
        groupDn: widget.group.dn,
        userDn: user.dn,
        operation: operation,
      );
      _reload();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _addMember(List<AddsDirectoryUser> members) async {
    final memberDns = members.map((member) => member.dn).toSet();
    final candidates = widget.candidates
        .where((candidate) => !memberDns.contains(candidate.dn))
        .toList();
    final selected = await showModalBottomSheet<AddsDirectoryUser>(
      context: context,
      builder: (_) => SafeArea(
        child: ListView(
          children: candidates.isEmpty
              ? const [
                  ListTile(
                    title: Text('Semua user pada OU ini sudah menjadi member.'),
                  ),
                ]
              : candidates
                    .map(
                      (user) => ListTile(
                        leading: const Icon(Icons.person_add_alt_1_rounded),
                        title: Text(user.name),
                        subtitle: Text(user.username),
                        onTap: () => Navigator.of(context).pop(user),
                      ),
                    )
                    .toList(),
        ),
      ),
    );
    if (selected != null) await _changeMember(selected, 'add');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.group.name)),
    body: FutureBuilder<List<AddsDirectoryUser>>(
      future: _members,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return _ErrorView(
            message: _message(snapshot.error),
            onRetry: _reload,
          );
        }
        final members = snapshot.data ?? const [];
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: members.length,
          itemBuilder: (_, index) => Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline_rounded),
              title: Text(members[index].name),
              subtitle: Text(members[index].username),
              trailing: IconButton(
                icon: const Icon(Icons.remove_circle_outline_rounded),
                tooltip: 'Keluarkan dari group',
                onPressed: () => _changeMember(members[index], 'remove'),
              ),
            ),
          ),
        );
      },
    ),
    floatingActionButton: FutureBuilder<List<AddsDirectoryUser>>(
      future: _members,
      builder: (_, snapshot) => FloatingActionButton.extended(
        onPressed: snapshot.hasData ? () => _addMember(snapshot.data!) : null,
        icon: const Icon(Icons.person_add_alt_1_rounded),
        label: const Text('Tambah member'),
      ),
    ),
  );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: AppColors.red,
            size: 34,
          ),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Coba lagi')),
        ],
      ),
    ),
  );
}

String _message(Object? error) =>
    error is ApiException ? error.message : 'ADDS tidak dapat dimuat.';
