package main

import (
	"bytes"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestJSONRPCErrorUsesRequestID(t *testing.T) {
	got := string(jsonRPCError("7"))
	if !strings.Contains(got, `"id":7`) {
		t.Fatalf("id 7: %s", got)
	}
	if !strings.Contains(got, "blocked by policy") {
		t.Fatalf("missing message: %s", got)
	}
	// An empty id is still a correlation key the client is waiting on.
	// Inventing a number would answer a call nobody made.
	if got := string(jsonRPCError("")); !strings.Contains(got, `"id":null`) {
		t.Fatalf("empty id must be JSON null, got %s", got)
	}
}

func TestFilterBlockedCalls(t *testing.T) {
	ok := `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/ok.txt"}}}`
	bad := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/.ssh/id_rsa"}}}`
	batch := `[` + bad + `,` + ok + `]`
	notify := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`

	t.Run("no blocked ids is a no-op", func(t *testing.T) {
		in := []byte(bad)
		if !bytes.Equal(filterBlockedCalls(in, nil), in) {
			t.Fatal("empty set must return the original frame")
		}
	})
	t.Run("single blocked call is dropped", func(t *testing.T) {
		if got := filterBlockedCalls([]byte(bad), blockedSet([]string{"1"})); got != nil {
			t.Fatalf("want nil, got %q", got)
		}
	})
	t.Run("batch keeps the sibling", func(t *testing.T) {
		got := filterBlockedCalls([]byte(batch), blockedSet([]string{"1"}))
		if got == nil {
			t.Fatal("sibling was dropped with the block")
		}
		if !bytes.Contains(got, []byte(`"id":2`)) {
			t.Fatalf("kept frame missing id 2: %s", got)
		}
		if bytes.Contains(got, []byte(`"id":1`)) {
			t.Fatalf("blocked id 1 still in the forwarded batch: %s", got)
		}
	})
	t.Run("batch of only blocked calls is nothing to send", func(t *testing.T) {
		allBad := `[` + bad + `]`
		if got := filterBlockedCalls([]byte(allBad), blockedSet([]string{"1"})); got != nil {
			t.Fatalf("want nil, got %q", got)
		}
	})
	t.Run("undecodable batch fails open", func(t *testing.T) {
		in := []byte(`[not-json`)
		if !bytes.Equal(filterBlockedCalls(in, blockedSet([]string{"1"})), in) {
			t.Fatal("parse failure must return the original bytes (NFR-3)")
		}
	})
	t.Run("non tools/call is not a block", func(t *testing.T) {
		in := []byte(notify)
		if !bytes.Equal(filterBlockedCalls(in, blockedSet([]string{"1"})), in) {
			t.Fatal("tools/list must not be stripped by a tools/call block set")
		}
	})
}

func TestReplaceRequestBodyResetsContentLength(t *testing.T) {
	r, err := http.NewRequest(http.MethodPost, "http://x", strings.NewReader("1234567890"))
	if err != nil {
		t.Fatal(err)
	}
	replaceRequestBody(r, []byte("ab"))
	if r.ContentLength != 2 {
		t.Fatalf("ContentLength=%d", r.ContentLength)
	}
	if r.Header.Get("Content-Length") != "2" {
		t.Fatalf("header %q", r.Header.Get("Content-Length"))
	}
	got, _ := io.ReadAll(r.Body)
	if string(got) != "ab" {
		t.Fatalf("body %q", got)
	}
}

func TestBlockedSet(t *testing.T) {
	m := blockedSet([]string{"1", "1", "2"})
	if !m["1"] || !m["2"] || m["3"] {
		t.Fatalf("%v", m)
	}
}
