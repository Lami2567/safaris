import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_typography.dart';
import '../models/tourism_model.dart';

String? extractYouTubeVideoId(String rawUrl) {
  final trimmed = rawUrl.trim();
  if (trimmed.isEmpty) return null;

  final uri = Uri.tryParse(trimmed);
  if (uri != null && uri.host.isNotEmpty) {
    final host = uri.host.toLowerCase();
    if (host == 'youtu.be' || host.endsWith('.youtu.be')) {
      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segments.isNotEmpty) {
        return segments.first.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
      }
    }
    if (host.contains('youtube.com') || host.contains('youtube-nocookie.com')) {
      final vParam = uri.queryParameters['v'];
      if (vParam != null && vParam.isNotEmpty) {
        return vParam.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
      }
      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      final idx = segments.indexWhere(
        (s) => s == 'embed' || s == 'shorts' || s == 'live' || s == 'v',
      );
      if (idx >= 0 && idx + 1 < segments.length) {
        return segments[idx + 1].replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
      }
    }
  }

  final match = RegExp(
    r'(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,20})',
    caseSensitive: false,
  ).firstMatch(trimmed);
  return match?.group(1);
}

class RichContentBlocksWidget extends StatelessWidget {
  final List<RichContentBlockModel> blocks;

  const RichContentBlocksWidget({super.key, required this.blocks});

  @override
  Widget build(BuildContext context) {
    if (blocks.isEmpty) return const SizedBox.shrink();

    final sorted = List<RichContentBlockModel>.from(blocks)
      ..sort((a, b) => a.order.compareTo(b.order));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: sorted.map((block) => _buildBlock(context, block)).toList(),
    );
  }

  Widget _buildBlock(BuildContext context, RichContentBlockModel block) {
    switch (block.type) {
      case 'heading':
        return Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.xs),
          child: Text(
            block.text,
            style: AppTypography.titleSmall.copyWith(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: AppColors.textPrimary,
            ),
          ),
        );

      case 'paragraph':
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            block.text,
            style: AppTypography.bodyMedium.copyWith(
              height: 1.6,
              color: AppColors.textPrimary,
            ),
          ),
        );

      case 'quote':
        return Container(
          margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: const Border(
              left: BorderSide(color: AppColors.accent, width: 3.5),
            ),
          ),
          child: Text(
            block.text,
            style: AppTypography.bodyMedium.copyWith(
              fontStyle: FontStyle.italic,
              color: AppColors.textPrimary,
            ),
          ),
        );

      case 'list':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: block.items.map((item) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 4),
                      child: Icon(Icons.check_circle_outline_rounded, size: 15, color: AppColors.accent),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        item,
                        style: AppTypography.bodyMedium.copyWith(color: AppColors.textPrimary),
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        );

      case 'image':
        if (block.url.isEmpty) return const SizedBox.shrink();
        return Container(
          margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: AppColors.surfaceElevated,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Image.network(
                block.url,
                fit: BoxFit.cover,
                width: double.infinity,
                height: 200,
                errorBuilder: (_, __, ___) => Container(
                  height: 140,
                  color: AppColors.surfaceElevated,
                  alignment: Alignment.center,
                  child: Icon(Icons.broken_image_outlined, color: AppColors.textSecondary, size: 32),
                ),
              ),
              if (block.caption.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: Text(
                    block.caption,
                    style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
                  ),
                ),
            ],
          ),
        );

      case 'video':
        if (block.url.isEmpty) return const SizedBox.shrink();
        final videoTitle = block.title.isNotEmpty
            ? block.title
            : (block.caption.isNotEmpty ? block.caption : 'Safari Expedition Video');
        return _InlineVideoPlayerCard(
          url: block.url,
          title: videoTitle,
          caption: block.caption,
        );

      case 'audio':
        if (block.url.isEmpty) return const SizedBox.shrink();
        final audioTitle = block.title.isNotEmpty
            ? block.title
            : (block.caption.isNotEmpty ? block.caption : 'Recorded Safari Narration');
        return _InlineAudioPlayerCard(
          url: block.url,
          title: audioTitle,
          caption: block.caption,
        );

      case 'link':
        if (block.url.isEmpty) return const SizedBox.shrink();
        final linkTitle = block.title.isNotEmpty
            ? block.title
            : (block.text.isNotEmpty
                ? block.text
                : (block.caption.isNotEmpty ? block.caption : 'Explore Safari Resource'));
        return _InlineActionLinkCard(
          title: linkTitle,
          url: block.url,
        );

      default:
        if (block.text.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(block.text, style: AppTypography.bodyMedium),
        );
    }
  }
}

class _InlineVideoPlayerCard extends StatefulWidget {
  final String url;
  final String title;
  final String caption;

  const _InlineVideoPlayerCard({
    required this.url,
    required this.title,
    required this.caption,
  });

  @override
  State<_InlineVideoPlayerCard> createState() => _InlineVideoPlayerCardState();
}

class _InlineVideoPlayerCardState extends State<_InlineVideoPlayerCard> {
  bool _isPlaying = false;
  WebViewController? _webViewController;

  String? get _youtubeId => extractYouTubeVideoId(widget.url);

  @override
  void didUpdateWidget(covariant _InlineVideoPlayerCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      setState(() {
        _isPlaying = false;
        _webViewController = null;
      });
    }
  }

  void _startPlayback() {
    final ytId = _youtubeId;
    final safeUrl = widget.url.trim().replaceAll('"', '&quot;');

    final String playerHtml = ytId != null
        ? '''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
    iframe { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; border: 0; background: #000; }
  </style>
</head>
<body>
  <iframe
    id="yt-player"
    src="https://www.youtube.com/embed/$ytId?enablejsapi=1&autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=https%3A%2F%2Fadmin.mumwesafarisuganda.com"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen
  ></iframe>
  <script>
    (function() {
      var f = document.getElementById('yt-player');
      if (!f) return;
      function play() {
        try {
          f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
        } catch (e) {}
      }
      f.addEventListener('load', function() {
        setTimeout(play, 120);
        setTimeout(play, 450);
        setTimeout(play, 1000);
      });
    })();
  </script>
</body>
</html>'''
        : '''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
    video { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #000; object-fit: contain; }
  </style>
</head>
<body>
  <video id="v" src="$safeUrl" autoplay controls playsinline preload="auto"></video>
  <script>
    var v = document.getElementById('v');
    if (v && v.play) { v.play().catch(function(){}); }
  </script>
</body>
</html>''';

    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black);

    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
    }

    controller.loadHtmlString(
      playerHtml,
      baseUrl: 'https://admin.mumwesafarisuganda.com',
    );

    setState(() {
      _isPlaying = true;
      _webViewController = controller;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ytId = _youtubeId;
    final thumbnailUrl = ytId != null ? 'https://img.youtube.com/vi/$ytId/hqdefault.jpg' : null;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xFF0A0D14),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.45)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.22),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            height: 215,
            width: double.infinity,
            child: _isPlaying && _webViewController != null
                ? WebViewWidget(controller: _webViewController!)
                : _buildCoverPreview(thumbnailUrl),
          ),
          if (widget.caption.isNotEmpty && widget.caption != widget.title)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.xs,
              ),
              child: Text(
                widget.caption,
                style: AppTypography.bodySmall.copyWith(color: AppColors.textSecondary),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCoverPreview(String? thumbnailUrl) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: _startPlayback,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (thumbnailUrl != null)
              Image.network(
                thumbnailUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _buildFallbackBackdrop(),
              )
            else
              _buildFallbackBackdrop(),
            Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.30),
                    Colors.black.withValues(alpha: 0.45),
                    Colors.black.withValues(alpha: 0.88),
                  ],
                ),
              ),
            ),
            // Top badge
            Positioned(
              top: 12,
              left: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.65),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.accent.withValues(alpha: 0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_rounded, size: 13, color: AppColors.accent),
                    const SizedBox(width: 5),
                    Text(
                      'SAFARI VIDEO',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.accent,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Center Play Button
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.accent,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.accent.withValues(alpha: 0.45),
                      blurRadius: 18,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.play_arrow_rounded,
                  color: Colors.black,
                  size: 38,
                ),
              ),
            ),
            // Bottom Title & Subtitle
            Positioned(
              left: 14,
              right: 14,
              bottom: 12,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.titleSmall.copyWith(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Tap play button to watch video',
                    style: AppTypography.bodySmall.copyWith(
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 11,
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

  Widget _buildFallbackBackdrop() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF141E30),
            Color(0xFF0A0F1D),
          ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.movie_filter_rounded,
          size: 56,
          color: Colors.white.withValues(alpha: 0.12),
        ),
      ),
    );
  }
}

class _InlineAudioPlayerCard extends StatefulWidget {
  final String url;
  final String title;
  final String caption;

  const _InlineAudioPlayerCard({
    required this.url,
    required this.title,
    required this.caption,
  });

  @override
  State<_InlineAudioPlayerCard> createState() => _InlineAudioPlayerCardState();
}

class _InlineAudioPlayerCardState extends State<_InlineAudioPlayerCard> {
  bool _isPlaying = false;
  WebViewController? _audioWebController;

  void _toggleAudio() {
    if (_audioWebController == null) {
      final safeUrl = widget.url.trim().replaceAll('"', '&quot;');
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.transparent);
      final platform = controller.platform;
      if (platform is AndroidWebViewController) {
        platform.setMediaPlaybackRequiresUserGesture(false);
      }
      controller.loadHtmlString(
        '<!DOCTYPE html><html><body style="margin:0;background:transparent;"><audio id="a" src="$safeUrl" autoplay></audio></body></html>',
        baseUrl: 'https://admin.mumwesafarisuganda.com',
      );
      setState(() {
        _audioWebController = controller;
        _isPlaying = true;
      });
      return;
    }

    if (_isPlaying) {
      _audioWebController!.runJavaScript('var a=document.getElementById("a"); if(a) a.pause();');
      setState(() => _isPlaying = false);
    } else {
      _audioWebController!.runJavaScript('var a=document.getElementById("a"); if(a) a.play();');
      setState(() => _isPlaying = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
      ),
      child: InkWell(
        onTap: _toggleAudio,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(
                _isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                color: Colors.black,
                size: 26,
              ),
            ),
            if (_audioWebController != null)
              SizedBox(
                width: 1,
                height: 1,
                child: Opacity(
                  opacity: 0,
                  child: WebViewWidget(controller: _audioWebController!),
                ),
              ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'SAFARI AUDIO GUIDE',
                    style: AppTypography.labelSmall.copyWith(
                      color: AppColors.accent,
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.title,
                    style: AppTypography.titleSmall.copyWith(fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                  Text(
                    _isPlaying ? 'Playing narration...' : 'Tap play button to listen',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.bodySmall.copyWith(fontSize: 11, color: AppColors.textSecondary),
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

class _InlineActionLinkCard extends StatelessWidget {
  final String title;
  final String url;

  const _InlineActionLinkCard({
    required this.title,
    required this.url,
  });

  Future<void> _openResource() async {
    final uri = Uri.tryParse(url.trim());
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
      ),
      child: InkWell(
        onTap: _openResource,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.accentMuted,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                ),
                child: const Icon(Icons.open_in_new_rounded, color: AppColors.accent, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'SAFARI RESOURCE',
                      style: AppTypography.labelSmall.copyWith(
                        color: AppColors.accent,
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      title,
                      style: AppTypography.titleSmall.copyWith(fontSize: 13, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.accent),
            ],
          ),
        ),
      ),
    );
  }
}
