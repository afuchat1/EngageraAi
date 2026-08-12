import { ScrollView, ScrollViewProps } from 'react-native';

type Props = ScrollViewProps & {
  /** Kept for call-site compatibility; built-in ScrollView does not use it. */
  bottomOffset?: number;
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset: _bottomOffset,
  ...props
}: Props) {
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
