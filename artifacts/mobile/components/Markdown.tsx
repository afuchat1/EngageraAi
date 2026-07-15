import React, { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { parseMarkdown, type InlineSegment, type MarkdownBlock } from '@/lib/markdown';

const MONOSPACE = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

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
  return (
    <Text style={style} selectable>
      {segments.map((seg, idx) => (
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
      ))}
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
      return (
        <View style={[styles.codeBlock, { backgroundColor: codeBg }]}>
          <Text selectable style={[styles.codeText, { color: codeColor }]}>
            {block.code}
          </Text>
        </View>
      );
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
});
