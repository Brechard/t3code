import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

export const WidgetPeriod = Schema.Literals(["all", "session", "weekly", "monthly", "tightest"]);
const WidgetResetDisplay = Schema.Literals(["reset", "both", "remaining"]);
export const SubscriptionWidgetConfiguration = Schema.Struct({
  providers: Schema.Array(Schema.Literals(["codex", "claudeAgent"])),
  accountIds: Schema.NullOr(Schema.Array(Schema.String)),
  environmentIds: Schema.NullOr(Schema.Array(Schema.String)),
  grouping: Schema.Literals(["accounts", "pooled"]),
  codexPeriod: WidgetPeriod,
  claudePeriod: WidgetPeriod,
  sort: Schema.Literals(["provider", "name", "remaining", "reset"]),
  density: Schema.Literals(["comfortable", "compact"]),
  windowsPerAccount: Schema.Literals([0, 1, 2, 3]),
  percentage: Schema.Literals(["remaining", "used"]),
  theme: Schema.Literals(["system", "light", "dark"]),
  showBars: Schema.Boolean,
  showResetTimes: Schema.Boolean,
  resetDisplay: WidgetResetDisplay.pipe(Schema.withDecodingDefault(Effect.succeed("reset"))),
  quotaResetDisplays: Schema.Record(Schema.String, WidgetResetDisplay).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
  showEnvironment: Schema.Literals(["auto", true, false]).pipe(
    Schema.withDecodingDefault(Effect.succeed("auto")),
  ),
  showUpdatedAt: Schema.Boolean,
});
export type SubscriptionWidgetConfiguration = typeof SubscriptionWidgetConfiguration.Type;

export const DEFAULT_WIDGET_CONFIGURATION: SubscriptionWidgetConfiguration = {
  providers: ["codex", "claudeAgent"],
  accountIds: null,
  environmentIds: null,
  grouping: "accounts",
  codexPeriod: "all",
  claudePeriod: "all",
  sort: "provider",
  density: "comfortable",
  windowsPerAccount: 0,
  percentage: "remaining",
  theme: "system",
  showBars: true,
  showResetTimes: true,
  resetDisplay: "reset",
  quotaResetDisplays: {},
  showEnvironment: "auto",
  showUpdatedAt: true,
};

const WidgetPreferences = Schema.Struct({
  defaults: SubscriptionWidgetConfiguration,
  widgets: Schema.Record(Schema.String, SubscriptionWidgetConfiguration),
});
export type SubscriptionWidgetPreferences = typeof WidgetPreferences.Type;
const decodeRecord = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown));
const decodeConfiguration = Schema.decodeUnknownOption(SubscriptionWidgetConfiguration);
const configurationFields = Object.entries(SubscriptionWidgetConfiguration.fields).map(
  ([key, field]) => ({ key, decode: Schema.decodeUnknownOption(field) }),
);

function recoverConfiguration(value: unknown) {
  const decoded = decodeConfiguration(value);
  if (Option.isSome(decoded)) return decoded;
  return Option.map(decodeRecord(value), (saved) => {
    const configuration: SubscriptionWidgetConfiguration = {
      ...DEFAULT_WIDGET_CONFIGURATION,
      providers: [],
      accountIds: [],
      environmentIds: [],
    };
    for (const { key, decode } of configurationFields) {
      const field = decode(saved[key]);
      if (Option.isSome(field)) Object.assign(configuration, { [key]: field.value });
    }
    return configuration;
  });
}

export function resolveWidgetPreferences(value: unknown): SubscriptionWidgetPreferences {
  const saved = Option.getOrUndefined(decodeRecord(value));
  const widgets = Option.getOrElse(decodeRecord(saved?.widgets), () => ({}));
  return {
    defaults: Option.getOrElse(
      recoverConfiguration(saved?.defaults),
      () => DEFAULT_WIDGET_CONFIGURATION,
    ),
    widgets: Object.fromEntries(
      Object.entries(widgets).flatMap(([id, value]) => {
        const decoded = recoverConfiguration(value);
        return Option.isSome(decoded) ? [[id, decoded.value]] : [];
      }),
    ),
  };
}

export function toggleWidgetSelection(
  selected: readonly string[] | null,
  available: readonly string[],
  id: string,
) {
  const next = new Set(selected ?? available);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return [...next];
}
