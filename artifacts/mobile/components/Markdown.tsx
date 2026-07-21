import React, { memo, useState } from 'react';
import { Image as RNImage, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

// react-native-svg works on web but SvgXml may not; guard it
let SvgXml: React.ComponentType<{ xml: string; width?: any; height?: any; style?: any }>;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SvgXml = require('react-native-svg').SvgXml;
} catch {
  SvgXml = ({ style }: any) => <View style={style} />;
}

// Native-only modules
const FileSystem = Platform.OS !== 'web' ? require('expo-file-system/legacy') : null;
const Sharing = Platform.OS !== 'web' ? require('expo-sharing') : null;
import { useColors } from '@/hooks/useColors';
import { useBrowser } from '@/contexts/BrowserContext';
import { parseMarkdown, type InlineSegment, type MarkdownBlock } from '@/lib/markdown';
import { faviconSrc } from '@/lib/favicon';

const MONOSPACE = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

/**
 * Saves a data: URI (base64) or remote URL to a temp file, then opens the
 * native share sheet so the user can save it to Photos, Files, or share it
 * — this is "download" on mobile without requesting any new device
 * permission (no direct Photos-library write access is needed).
 */
async function downloadToShareSheet(source: string, filename: string) {
  try {
    if (Platform.OS === 'web') {
      // On web: for data URIs create a download link; for URLs open in new tab
      const dataMatch = source.match(/^data:([^;]+);base64,(.+)$/);
      if (dataMatch) {
        const a = document.createElement('a');
        a.href = source;
        a.download = filename;
        a.click();
      } else if (/^https?:\/\//i.test(source)) {
        window.open(source, '_blank');
      }
      return;
    }
    let fileUri = `${FileSystem.cacheDirectory}${filename}`;
    const dataMatch = source.match(/^data:([^;]+);base64,(.+)$/);
    if (dataMatch) {
      await FileSystem.writeAsStringAsync(fileUri, dataMatch[2], { encoding: 'base64' as any });
    } else if (/^https?:\/\//i.test(source)) {
      const result = await FileSystem.downloadAsync(source, fileUri);
      fileUri = result.uri;
    } else {
      await FileSystem.writeAsStringAsync(fileUri, source);
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri);
    }
  } catch {
    // Best-effort download; the image/SVG stays viewable either way.
  }
}

function DownloadButton({ onPress, color, bg }: { onPress: () => void; color: string; bg: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.downloadBtn, { backgroundColor: bg }]}>
      <Ionicons name="download-outline" size={15} color={color} />
    </Pressable>
  );
}

/**
 * Renders a generated raster image (data: URI or remote URL) as a real
 * <Image>, never as raw markdown/base64 text, with a download action.
 */
function ImageBlockView({ url }: { url: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <View style={styles.imageError}>
        <Ionicons name="image-outline" size={20} color="#666" />
        <Text style={styles.imageErrorText}>Image unavailable</Text>
      </View>
    );
  }
  return (
    <View style={styles.imageWrap}>
      <Image
        source={{ uri: url }}
        style={styles.generatedImage}
        onError={() => setError(true)}
        contentFit="cover"
        // expo-image decodes large data: URIs (100KB+ base64, common for
        // AI-generated images) reliably on Android, where RN's core
        // <Image> component is known to silently fail on big inline
        // base64 sources.
        cachePolicy="memory-disk"
      />
      <DownloadButton onPress={() => downloadToShareSheet(url, `image-${Date.now()}.jpg`)} color="#fff" bg="rgba(0,0,0,0.55)" />
    </View>
  );
}

/**
 * Renders AI-generated SVG art as a real rasterized-in-place image via
 * react-native-svg's <SvgXml> — the SVG markup is parsed into native
 * drawing commands, never shown as raw code/text — plus a download action
 * that shares the original .svg file.
 */
function SvgBlockView({ code }: { code: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <View style={styles.imageWrap}>
      <View style={styles.svgBox} onLayout={() => {}}>
        {/* @ts-ignore — onError not in @types/react-native-svg but supported at runtime */}
        <SvgXml xml={code} width="100%" height={220} onError={() => setFailed(true)} />
      </View>
      <DownloadButton onPress={() => downloadToShareSheet(code, `image-${Date.now()}.svg`)} color="#fff" bg="rgba(0,0,0,0.55)" />
    </View>
  );
}

/**
 * A tappable favicon for a link, embedded inline inside surrounding text.
 * The URL itself is never rendered as text — only the site's icon, which
 * opens the real destination when tapped. Falls back to a generic link
 * glyph if the favicon fails to load (still never showing the raw URL).
 */
function LinkFavicon({ url, color }: { url: string; color: string }) {
  const [failed, setFailed] = useState(false);
  const { open } = useBrowser();
  const src = faviconSrc(url);
  const handlePress = () => open(url);
  if (failed || !src) {
    return (
      <Text onPress={handlePress} style={{ color }}>
        {' '}
        <Ionicons name="link" size={13} color={color} />
        {' '}
      </Text>
    );
  }
  return (
    <Text onPress={handlePress}>
      {' '}
      <RNImage source={{ uri: src }} style={styles.faviconInline} onError={() => setFailed(true)} />
      {' '}
    </Text>
  );
}

function InlineText({
  segments,
  color,
  codeColor,
  codeBg,
  style,
}: {
  segments: InlineSegment[];
  color: string;
  codeColor: string;
  codeBg: string;
  style?: object;
}) {
  const { open } = useBrowser();
  return (
    <Text style={style} selectable>
      {segments.map((seg, idx) => {
        if (seg.link) {
          return (
            <Text key={idx}>
              {seg.text ? (
                <Text onPress={() => open(seg.link!)} style={[styles.linkLabel, { color }]}>
                  {seg.text}
                </Text>
              ) : null}
              <LinkFavicon url={seg.link} color={color} />
            </Text>
          );
        }
        return (
          <Text
            key={idx}
            style={[
              { color },
              seg.bold ? styles.bold : null,
              seg.italic ? styles.italic : null,
              seg.code
                ? [styles.inlineCode, { color: codeColor, backgroundColor: codeBg }]
                : null,
            ]}
          >
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
}

/**
 * Renders parsed markdown as clearly separated blocks — headings, body
 * paragraphs, clean-bulleted lists, numbered lists, quotes, and code — so
 * a response reads as an organized document instead of one dense wall of
 * text. Re-parses on every render, which is cheap for chat-length text and
 * keeps it safe to call while a message is still streaming in.
 */
export const Markdown = memo(function Markdown({ text, color }: { text: string; color: string }) {
  const colors = useColors();
  const blocks = parseMarkdown(text);
  const codeColor = colors.foreground;
  const codeBg = colors.card;

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => (
        <MarkdownBlockView key={idx} block={block} color={color} codeColor={codeColor} codeBg={codeBg} />
      ))}
    </View>
  );
});

function MarkdownBlockView({
  block,
  color,
  codeColor,
  codeBg,
}: {
  block: MarkdownBlock;
  color: string;
  codeColor: string;
  codeBg: string;
}) {
  switch (block.type) {
    case 'heading': {
      const headingStyle =
        block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
      return <InlineText segments={block.inline} color={color} codeColor={codeColor} codeBg={codeBg} style={headingStyle} />;
    }
    case 'paragraph':
      return <InlineText segments={block.inline} color={color} codeColor={codeColor} codeBg={codeBg} style={styles.paragraph} />;
    case 'bullet-list':
      return (
        <View style={styles.list}>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.listRow}>
              <Text style={[styles.bullet, { color }]}>{'\u2022'}</Text>
              <InlineText segments={item} color={color} codeColor={codeColor} codeBg={codeBg} style={styles.listText} />
            </View>
          ))}
        </View>
      );
    case 'numbered-list':
      return (
        <View style={styles.list}>
          {block.items.map((item, idx) => (
            <View key={idx} style={styles.listRow}>
              <Text style={[styles.numberMarker, { color }]}>{item.marker}</Text>
              <InlineText segments={item.inline} color={color} codeColor={codeColor} codeBg={codeBg} style={styles.listText} />
            </View>
          ))}
        </View>
      );
    case 'blockquote':
      return (
        <View style={[styles.quote, { borderLeftColor: codeColor }]}>
          <InlineText segments={block.inline} color={color} codeColor={codeColor} codeBg={codeBg} style={styles.quoteText} />
        </View>
      );
    case 'code':
      // SVG "code" is never shown as raw markup/text — it's rendered as a
      // real image (see SvgBlockView), with a download action for the
      // original file, matching the web app's behavior.
      if (block.lang === 'svg') {
        return <SvgBlockView code={block.code} />;
      }
      return (
        <View style={[styles.codeBlock, { backgroundColor: codeBg }]}>
          <Text selectable style={[styles.codeText, { color: codeColor }]}>
            {block.code}
          </Text>
        </View>
      );
    case 'image':
      return <ImageBlockView url={block.url} />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  paragraph: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  h1: { fontSize: 20, lineHeight: 27, fontFamily: 'SpaceGrotesk_600SemiBold', letterSpacing: -0.2, marginTop: 2 },
  h2: { fontSize: 18, lineHeight: 25, fontFamily: 'SpaceGrotesk_600SemiBold', letterSpacing: -0.2, marginTop: 2 },
  h3: { fontSize: 16.5, lineHeight: 23, fontFamily: 'SpaceGrotesk_600SemiBold', marginTop: 2 },
  bold: { fontFamily: 'Inter_600SemiBold' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: MONOSPACE,
    fontSize: 14.5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  list: { gap: 6 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  numberMarker: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_600SemiBold', minWidth: 20 },
  listText: { flex: 1, fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  quote: { borderLeftWidth: 3, paddingLeft: 12, opacity: 0.85 },
  quoteText: { fontSize: 15.5, lineHeight: 22, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  codeBlock: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  codeText: { fontFamily: MONOSPACE, fontSize: 14, lineHeight: 20 },
  imageWrap: { position: 'relative', alignSelf: 'flex-start', maxWidth: 280 },
  generatedImage: { width: 280, height: 210, borderRadius: 14, backgroundColor: '#111' },
  svgBox: { width: 280, height: 220, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageError: { width: 280, height: 160, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 6 },
  imageErrorText: { fontSize: 12, color: '#666', fontFamily: 'Inter_400Regular' },
  downloadBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkLabel: {
    textDecorationLine: 'underline',
  },
  faviconInline: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
});
