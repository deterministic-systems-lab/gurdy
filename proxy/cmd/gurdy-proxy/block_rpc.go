package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
)

// jsonRPCError is the protocol-level denial the shim/HTTP path writes when
// Forward=false. The id is the request's raw JSON-RPC id (the correlation
// key mcp.ParseToolsCalls already extracted), so the agent is not left
// waiting on a call the child will never answer.
func jsonRPCError(id string) []byte {
	if id == "" {
		id = "null"
	}
	return []byte(`{"jsonrpc":"2.0","id":` + id + `,"error":{"code":-32003,"message":"blocked by policy"}}`)
}

// filterBlockedCalls drops blocked tools/call elements from a JSON-RPC body
// so siblings can still be forwarded (batch semantics). nil means nothing
// remains to send upstream. On parse failure the original body is returned
// (fail-open: do not invent a frame).
func filterBlockedCalls(chunk []byte, blocked map[string]bool) []byte {
	if len(blocked) == 0 {
		return chunk
	}
	trim := bytes.TrimSpace(chunk)
	if len(trim) == 0 {
		return chunk
	}
	if trim[0] == '[' {
		var elems []json.RawMessage
		if json.Unmarshal(trim, &elems) != nil {
			return chunk
		}
		var keep []json.RawMessage
		for _, e := range elems {
			if blockedID(e, blocked) {
				continue
			}
			keep = append(keep, e)
		}
		if len(keep) == 0 {
			return nil
		}
		out, err := json.Marshal(keep)
		if err != nil {
			return chunk
		}
		return append(out, '\n')
	}
	if blockedID(trim, blocked) {
		return nil
	}
	return chunk
}

func blockedID(raw []byte, blocked map[string]bool) bool {
	var f struct {
		Method *string         `json:"method"`
		ID     json.RawMessage `json:"id"`
	}
	if json.Unmarshal(raw, &f) != nil || f.Method == nil || *f.Method != "tools/call" {
		return false
	}
	id := string(f.ID)
	if id == "null" {
		id = ""
	}
	return blocked[id]
}

func replaceRequestBody(r *http.Request, body []byte) {
	r.Body = io.NopCloser(bytes.NewReader(body))
	r.ContentLength = int64(len(body))
	if r.Header != nil {
		r.Header.Set("Content-Length", strconv.FormatInt(r.ContentLength, 10))
	}
}

func blockedSet(ids []string) map[string]bool {
	m := make(map[string]bool, len(ids))
	for _, id := range ids {
		m[id] = true
	}
	return m
}
