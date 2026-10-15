import type { ComponentProps } from "react";
import { Alert, Pressable } from "react-native";
import { MaterialButton } from "../../components/MaterialButton";
import { MaterialIconButton } from "../../components/MaterialIconButton";

export function PullRequestPermissionButton({
  reason,
  ...props
}: ComponentProps<typeof MaterialButton> & { reason?: string | undefined }) {
  const button = <MaterialButton {...props} disabled={props.disabled || Boolean(reason)} />;
  return reason ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label}. ${reason}`}
      onPress={() => Alert.alert("Action unavailable", reason)}
    >
      {button}
    </Pressable>
  ) : (
    button
  );
}
export function PullRequestPermissionIconButton({
  reason,
  ...props
}: ComponentProps<typeof MaterialIconButton> & { reason?: string | undefined }) {
  const button = <MaterialIconButton {...props} disabled={props.disabled || Boolean(reason)} />;
  return reason ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.accessibilityLabel}. ${reason}`}
      onPress={() => Alert.alert("Action unavailable", reason)}
    >
      {button}
    </Pressable>
  ) : (
    button
  );
}
