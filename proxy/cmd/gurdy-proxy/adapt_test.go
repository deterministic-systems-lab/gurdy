package main

import (
	"crypto/sha256"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/deterministic-systems-lab/gurdy/proxy/internal/mcp"
)

// toSignatures exists so internal/toolsig does not import internal/mcp (§7).
// The risk in a field-by-field adapter is a dropped field: an InputSchema lost
// here would silently change every tool's signature hash, which is what policy
// binds to instead of the display name — so a rename would stop being visible.
func TestToSignaturesPreservesEveryField(t *testing.T) {
	schema := json.RawMessage(`{"type":"object","properties":{"path":{"type":"string"}}}`)
	got := toSignatures([]mcp.ToolDeclaration{
		{Name: "read_file", Description: "reads a file", InputSchema: schema},
		{Name: "write_file"}, // description and schema absent, which is legal
	})

	if len(got) != 2 {
		t.Fatalf("got %d declarations, want 2", len(got))
	}
	if got[0].Name != "read_file" || got[0].Description != "reads a file" {
		t.Errorf("name/description not carried: %+v", got[0])
	}
	if string(got[0].InputSchema) != string(schema) {
		t.Errorf("InputSchema not carried: got %q want %q", got[0].InputSchema, schema)
	}
	if got[1].Name != "write_file" || got[1].InputSchema != nil {
		t.Errorf("absent fields should stay absent, not be invented: %+v", got[1])
	}
}

// An empty catalogue is a fact a server may report, and it must not become a
// nil slice the registry then treats differently from "no tools declared".
func TestToSignaturesEmptyStaysEmpty(t *testing.T) {
	got := toSignatures(nil)
	if got == nil {
		t.Fatal("nil slice for an empty catalogue; want an empty non-nil slice")
	}
	if len(got) != 0 {
		t.Fatalf("got %d declarations from nil input, want 0", len(got))
	}
}

// hashingWriter wraps the real ResponseWriter to hash the response, and its
// Unwrap is what keeps that wrapping invisible: http.ResponseController finds
// capabilities the wrapper never names by unwrapping to the writer underneath.
// Without it, Flush reaches the client as ErrNotSupported and a streaming
// response stalls — inspection wiring breaking the traffic it exists to watch
// (NFR-3). The claim is in a comment; this is the check behind it.
func TestHashingWriterUnwrapKeepsResponseControllerCapabilities(t *testing.T) {
	rec := httptest.NewRecorder()
	w := &hashingWriter{ResponseWriter: rec, h: sha256.New()}

	if got := w.Unwrap(); got != http.ResponseWriter(rec) {
		t.Fatalf("Unwrap returned %T, want the wrapped recorder", got)
	}
	// The real assertion: the capability arrives through the wrapper, not just
	// that the field is readable.
	if err := http.NewResponseController(w).Flush(); err != nil {
		t.Errorf("Flush through the wrapper: %v (a wrapper without Unwrap fails here)", err)
	}
	if !rec.Flushed {
		t.Error("Flush did not reach the underlying writer")
	}
}
