<!-- Adapted from github.com/obra/superpowers · skills/systematic-debugging/root-cause-tracing.md (MIT, © 2025 Jesse Vincent), v6.4.1. -->

# Trace back to the source

An error often shows up deep in the call stack, far from where the wrong value was born. Fixing where it shows up fixes the symptom.

## Method

1. **Record the symptom:** which value is wrong, in which function, at which file:line.
2. **Find the nearest source:** which function passes that value in? Find the callers with a code-intelligence tool if the project has one, otherwise a targeted search; do not grep and guess.
3. **Ask: is the value already wrong here?** Already wrong → go up one more layer, repeat step 2. Still right → the source is between this layer and the one below.
4. **Stop where the value starts to be wrong** (config read, user input, database data, default value). Fix it there.

## When you cannot trace by hand

Add a diagnostic log right before the failing operation (only when the file-editing step is allowed, after `intent.md`): print the calling function, the parameters as yes / no / length (not the value, not a hash), the working directory, the relevant environment variables (names, not values). Run once, read the log, then remove it.

## Neutral example

Symptom: an exported report is missing the rows of one customer.
- The export function already receives a short list → go up a layer.
- The filter function receives everything and returns less → the filter compares dates in the server time zone.
- Source: the date value read from configuration carries no time zone. Fix it where the configuration is read, not by patching the export function.
