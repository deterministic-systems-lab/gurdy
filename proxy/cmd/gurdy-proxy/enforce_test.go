package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/deterministic-systems-lab/gurdy/proxy/internal/extract"
	"github.com/deterministic-systems-lab/gurdy/proxy/internal/ledger"
	"github.com/deterministic-systems-lab/gurdy/proxy/internal/policy"
	"github.com/deterministic-systems-lab/gurdy/proxy/internal/tis"
)

func blockingPack(t *testing.T) *policy.Evaluator {
	t.Helper()
	ev, err := policy.Load("enforce-test@1", []byte(`
@id("would-block") @enforce_action("block") @on_error("open")
forbid (principal, action, resource) when { context has resource_path && context.resource_path like "*/.ssh/*" };
@id("allow-rest") permit (principal, action, resource);
`))
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

func TestEnforceActuatorPlan(t *testing.T) {
	plan := enforceActuator{}.Plan(policy.Block)
	if plan.Forward || !plan.Durable || plan.Applied != ledger.ActionBlocked {
		t.Fatalf("block plan: %+v", plan)
	}
	open := enforceActuator{}.Plan(policy.Indeterminate)
	if !open.Forward || open.Applied != ledger.ActionFailedOpen {
		t.Fatalf("indeterminate must fail-open: %+v", open)
	}
	allow := enforceActuator{}.Plan(policy.Allow)
	if !allow.Forward || allow.Applied != ledger.ActionForwarded {
		t.Fatalf("allow: %+v", allow)
	}
}

func TestHTTPEnforceBlocksCredentialRead(t *testing.T) {
	h := newHarness(t)
	h.store.Swap(blockingPack(t))
	var saw string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		saw = string(b)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()
	target, _ := url.Parse(upstream.URL)
	g := newHTTPGateway(target, h.store, h.tis, h.led, "test-tenant", slogTo(h.decisionLog))
	g.act = enforceActuator{}
	g.mode = ledger.ModeEnforce
	proxy := httptest.NewServer(g)
	defer proxy.Close()

	resp, err := http.Post(proxy.URL, "application/json", strings.NewReader(credReadCall))
	if err != nil {
		t.Fatal(err)
	}
	out, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(out), "blocked by policy") {
		t.Fatalf("want jsonrpc error, got %q status %d", out, resp.StatusCode)
	}
	if saw != "" {
		t.Fatalf("upstream saw blocked call: %q", saw)
	}
	rec := lastLogDecision(t, h.decisionLog.String())
	if rec["action_applied"] != ledger.ActionBlocked {
		t.Fatalf("want blocked, got %v", rec)
	}
	if rec["policy_mode"] != ledger.ModeEnforce {
		t.Fatalf("want enforce mode, got %v", rec)
	}
}

func TestShimEnforceWritesJSONRPCError(t *testing.T) {
	h := newHarness(t)
	h.store.Swap(blockingPack(t))
	g := newGateway(h.store, h.tis, h.led, "test-tenant", slogTo(h.decisionLog))
	g.act = enforceActuator{}
	g.mode = ledger.ModeEnforce
	var out bytes.Buffer
	if err := runShim(g, []string{"cat"}, strings.NewReader(credReadCall+"\n"), &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "blocked by policy") {
		t.Fatalf("client did not get jsonrpc error: %q", out.String())
	}
	if strings.Contains(out.String(), "read_file") {
		t.Fatalf("blocked call was echoed by child: %q", out.String())
	}
	rec := lastLogDecision(t, h.decisionLog.String())
	if rec["action_applied"] != ledger.ActionBlocked {
		t.Fatalf("want blocked, got %v", rec)
	}
}

func TestSidecarTxnEnrichesAssertion(t *testing.T) {
	h := newHarness(t)
	g := newGateway(h.store, h.tis, h.led, "test-tenant", slogTo(h.decisionLog))
	top := tis.Scope{Compartments: []string{"*"}, ResourceTypes: []string{"*"},
		Actions: []string{"*"}, Purpose: "*"}
	tok, err := h.tis.MintTxn("agent:conv-1", "dev@example.com", top, h.store.Current().Version, 0)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "current.txn")
	if err := os.WriteFile(path, []byte(tok), 0o600); err != nil {
		t.Fatal(err)
	}
	g.txnFile = path
	body := []byte(credReadCall)
	_, _ = g.decideCall(context.Background(), "", "stdio:cat", extract.Call{
		Tool: "read_file", Arguments: map[string]any{"path": "/tmp/x.txt"},
	}, body)
	rec := lastLogDecision(t, h.decisionLog.String())
	if rec["assertion_status"] != ledger.AssertionValid {
		t.Fatalf("sidecar txn not consumed: %v", rec)
	}
	if rec["asserted_principal"] != "agent:conv-1" {
		t.Fatalf("asserted_principal: %v", rec)
	}
	principal, _ := rec["principal"].(string)
	if !strings.HasPrefix(principal, "svc:") {
		t.Fatalf("observed principal must stay svc:…, got %v", rec["principal"])
	}
}

func lastLogDecision(t *testing.T, logged string) map[string]any {
	t.Helper()
	var last map[string]any
	for _, line := range strings.Split(logged, "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, `"msg":"decision"`) {
			continue
		}
		var obj map[string]any
		if json.Unmarshal([]byte(line), &obj) != nil {
			continue
		}
		last = obj
	}
	if last == nil {
		t.Fatalf("no decision log line in %s", logged)
	}
	return last
}
