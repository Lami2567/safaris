import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../../../shared/widgets/safaris_app_bar.dart';
import '../../rides/models/ride_model.dart';

class ChatScreen extends StatefulWidget {
  final DriverModel? driver;

  const ChatScreen({super.key, this.driver});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _msgController = TextEditingController();
  final List<_ChatMessage> _messages = [
    _ChatMessage(
      text: 'Hello! I am outside near the main gate of Acacia Mall.',
      isMe: false,
      time: '14:22',
    ),
    _ChatMessage(
      text: 'Great, I am walking down the stairs now. Silver Premio, right?',
      isMe: true,
      time: '14:23',
    ),
    _ChatMessage(
      text: 'Yes, plate UBM 714K. Hazards are on.',
      isMe: false,
      time: '14:23',
    ),
  ];

  void _sendMessage() {
    final text = _msgController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _messages.add(
        _ChatMessage(
          text: text,
          isMe: true,
          time: 'Now',
        ),
      );
      _msgController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final driverName = widget.driver?.fullName ?? 'Driver Moses Okello';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: SafarisAppBar(
        title: driverName,
        subtitle: 'Online • In-App Encrypted Chat',
        actions: [
          IconButton(
            icon: const Icon(Icons.phone_rounded, color: AppColors.accent, size: 20),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Calling $driverName...')),
              );
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Message List
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(AppSpacing.md),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final msg = _messages[index];
                  return Align(
                    alignment: msg.isMe ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: msg.isMe ? AppColors.accent : AppColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        border: Border.all(
                          color: msg.isMe ? AppColors.accent : AppColors.border,
                          width: 1,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment:
                            msg.isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          Text(
                            msg.text,
                            style: AppTypography.bodyMedium.copyWith(
                              color: msg.isMe ? AppColors.backgroundDark : AppColors.textPrimary,
                              fontWeight: msg.isMe ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            msg.time,
                            style: AppTypography.bodySmall.copyWith(
                              fontSize: 10,
                              color: msg.isMe
                                  ? AppColors.backgroundDark.withOpacity(0.7)
                                  : AppColors.textTertiary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            // Chat Input Bar
            Container(
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border(top: BorderSide(color: AppColors.border, width: 1)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _msgController,
                      style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                      decoration: InputDecoration(
                        hintText: 'Type message to driver...',
                        filled: true,
                        fillColor: AppColors.surfaceElevated,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                          borderSide: BorderSide(color: AppColors.border),
                        ),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: AppColors.accent,
                    child: IconButton(
                      icon: Icon(Icons.send_rounded, size: 18, color: AppColors.backgroundDark),
                      onPressed: _sendMessage,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatMessage {
  final String text;
  final bool isMe;
  final String time;

  _ChatMessage({
    required this.text,
    required this.isMe,
    required this.time,
  });
}
