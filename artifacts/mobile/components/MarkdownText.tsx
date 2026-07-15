import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * Minimal, dependency-free markdown renderer for chat output.
 * Supports: paragraphs, fenced code blocks, inline `code`, **bold**, and "- " bullet lists.
 * Intentionally simple — chat responses use light formatting, not full CommonMark.
 */

interface InlineProps {
  text: string;
  color: string;
  codeColor: string;
  codeBg: string;
  fontSize: number;
  lineHeight: number;
}

function InlineText({ text, color, codeColor, codeBg, fontSize, lineHeight }: InlineProps) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter((t) => t.length > 0);
  return (
    <Text style={{ color, fontSize, lineHeight, fontFamily: 'Inter_400Regular' }} selectable>
      {tokens.map((token, i) => {
        if (token.startsWith('`') && token.endsWith('`') && token.length > 1) {
          return (
            <Text
              key={i}
              style={{
                fontFamily: 'Inter_500Medium',
                color: codeColor,
                backgroundColor: codeBg,
              }}
            >
              {' '}
              {token.slice(1, -1)}{' '}
            </Text>
          );
        }
        if (token.startsWith('**') && token.endsWith('**') && token.length > 3) {
          return (
            <Text key={i} style={{ fontFamily: 'Inter_700Bold', color }}>
              {token.slice(2, -2)}
            </Text>
          );
        }
        return <Text key={i}>{token}</Text>;
      })}
    </Text>
  );
}

export function MarkdownText({ text, color, size = 16 }: { text: string; color: string; size?: number }) {
  const colors = useColors();
  const lineHeight = size * 1.4;
  const blocks = text.split(/\n{2,}/);

  return (
    <View style={styles.container}>
      {blocks.map((block, blockIdx) => {
        if (block.startsWith('```')) {
          const code = block.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/```$/, '');
          return (
            <View
              key={blockIdx}
              style={[styles.codeBlock, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.codeText, { color }]} selectable>
                {code}
              </Text>
            </View>
          );
        }

        const lines = block.split('\n');
        const isList = lines.every((l) => l.trim().startsWith('- ') || l.trim().length === 0);
        if (isList) {
          return (
            <View key={blockIdx} style={styles.list}>
              {lines
                .filter((l) => l.trim().length > 0)
                .map((line, i) => (
                  <View key={i} style={styles.listItem}>
                    <Text style={{ color, fontSize: size, lineHeight }}>{'\u2022'}</Text>
                    <View style={styles.listItemText}>
                      <InlineText
                        text={line.trim().replace(/^- /, '')}
                        color={color}
                        codeColor={color}
                        codeBg={colors.card}
                        fontSize={size}
                        lineHeight={lineHeight}
                      />
                    </View>
                  </View>
                ))}
            </View>
          );
        }

        return (
          <InlineText
            key={blockIdx}
            text={block}
            color={color}
            codeColor={color}
            codeBg={colors.card}
            fontSize={size}
            lineHeight={lineHeight}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  codeBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
  },
  codeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    lineHeight: 19,
  },
  list: { gap: 4 },
  listItem: { flexDirection: 'row', gap: 8 },
  listItemText: { flex: 1 },
});
