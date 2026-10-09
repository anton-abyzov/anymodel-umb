# AnyModel 2.0 independent release review

Reviewed integration `b7ae0b5dedb970bc1e7101121f1b8cbc60b81fe0` including T-07 policy merge `685fec6`, identical in reviewed runtime files to independently tested fix `0179971f72177c62800c951a3ae08202b186b21f`. **No unresolved source findings: 0 critical, 0 high, 0 medium.** The documentation-only follow-up `b7ae0b5` accurately describes the OpenRouter-specific free policy and rejection by other hosted adapters.

All ten original audit defects and both T-06 stream failure defects have independent regression evidence. This final pass found one further high issue: FREE_ONLY checked only the primary model, permitting paid fallbacks, presets, plugins and server tools. Five independent mock reproductions changed from HTTP200/one upstream call to 403/zero calls after the fix. All 48 independently executed policy tests pass under the network guard, including paid-mode preservation and bounded real OpenCode fields. The separately read full-suite receipt records 642 passing tests, zero skips/network violations and 87.65% line coverage. This reviewer reran 48 relevant tests; the 642-test full run was performed by the implementer.

The hosted evaluation gate passes 13 independently run evaluator tests plus nine adversarial mock cases. It rejects alternate routing/preset injection, paid services and remote media, and reserves maximum cache/context prices through one preserved $4.75 ledger. Initial nine gate-rejected OpenCode attempts reached no provider and remain separately recorded.

## Independently rescored coding pilot

| Arm | Artifact-correct | Clean accepted | Limitation |
| --- | --- | --- | --- |
| Native Codex frontier | 3/3 | 3/3 | One recovered self-test error; native billing/server model receipt unavailable |
| OpenCode frontier direct | 3/3 | 3/3 | Three tiny single-file tasks, one attempt |
| Same frontier through AnyModel | 3/3 | 2/3 | Final task censored by shared reservation cap |
| OpenCode Qwen direct | 1/3 | 0/3 | Two request-censored cells; one clean security repair failed 5/10 hidden checks |

All 12 artifact scores, fixture/test hashes, raw completion signals and forbidden-change checks match the runner reports. All nine portable hosted source/event copies match the originals. Qwen's completed auth repair has an undefined `effectiveKey` and fails arbitrary-route authentication; the two request-censored cells do not prove model failure. OpenCode auxiliary calls consume the same six-request allowance. The prior externally interrupted native dictionary attempt remains outside accepted counts. No model repair retry was selected to improve these outcomes.

Hosted pilot: 47 reservations and 47 response receipts, all with cost; response-reported total $0.24970722, conservative reservations $4.68959280 below $4.75. These are different quantities. The pilot supports keeping native frontier Studio agents as default and requiring verification/escalation for cheap delegates; it establishes no broad model ranking, parity or causal proxy advantage.

The separate 10-request protocol smoke has eight expected passes and two instances of the same upstream Qwen Messages boundary: a tool call ends with `end_turn`, through both proxy and direct provider. GPT Chat/Messages and Qwen Chat tool/result loops pass. Invalid credentials retain 401/error payloads. All response hashes and independently parsed SSE stops match. Response-reported cost $0.0015114, reserved upper bound $0.10253776; rejected credential calls have no cost receipt.

Source review, installed npm artifact, deployment and public readback are distinct. This review clears source; coordinator-owned registry/install/site/worker receipts remain separate. No local inference, discovery or warmup; no new paid calls by this reviewer and no browser automation. SpecWeave installed and registry both 3.0.6; owners preserved. Evidence: `final-review.json`, `pilot-final-rescore.json`, `portable-pilot-validation.json`, `hosted-independent-validation.json`, `free-only-policy-fixed.json` and `free-policy-tests-final.tap`.
