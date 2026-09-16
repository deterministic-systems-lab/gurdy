package keyfile

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

// Two processes starting against one state directory must converge on a single
// key. If each kept the key it generated while the file held the other's, the
// ledger would sign under a key its own chain header does not name.
//
// Repeated, and with every caller released from one starting gate, because the
// bug this guards is a *window* rather than a state: the previous version
// created the file with O_EXCL and wrote it a moment later, so a loser reading
// in between got half a PEM block. One round of eight goroutines on a fast
// machine missed it every time and CI caught it on the first run — a test that
// only fails on someone else's hardware is a test that gets called flaky and
// muted. The gate collapses the start times so the losers arrive during the
// window rather than after it.
//
// It is still *probabilistic*, and worth saying so rather than letting the
// round count imply otherwise: it does not force a loser to read in between the
// winner's create and write, it only makes that likely. It did catch the real
// bug (round 11 locally, first run on CI), but a machine that schedules
// differently could miss it. Proving the absence of the window would need an
// injectable seam between create and write — test-only machinery inside the
// function whose simplicity is the reason it is easy to audit — which is a
// worse trade than a test that is honest about being a probability.
func TestConcurrentCreateConverges(t *testing.T) {
	const (
		rounds = 20
		n      = 16
	)
	for round := range rounds {
		path := filepath.Join(t.TempDir(), "key.pem")
		keys := make([]string, n)
		gate := make(chan struct{})
		var wg sync.WaitGroup
		for i := range n {
			wg.Add(1)
			go func() {
				defer wg.Done()
				<-gate
				k, err := LoadOrCreate(path)
				if err != nil {
					t.Errorf("round %d caller %d: %v", round, i, err)
					return
				}
				keys[i] = k.D.String()
			}()
		}
		close(gate)
		wg.Wait()
		if t.Failed() {
			return
		}

		onDisk, err := load(path)
		if err != nil {
			t.Fatalf("round %d: %v", round, err)
		}
		for i, k := range keys {
			if k != onDisk.D.String() {
				t.Fatalf("round %d: caller %d holds a key that is not the one on disk", round, i)
			}
		}
	}
}

// The signing key is the root of every claim the ledger makes. These cover the
// paths where LoadOrCreate must refuse rather than improvise: a key it cannot
// read is not the same as a key that is absent, and treating the first as the
// second would silently mint a *new* identity and start a chain nobody can tie
// to the previous one.

func TestCorruptKeyIsAnErrorNotAFreshKey(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "key.pem")
	if err := os.WriteFile(path, []byte("this is not a PEM block"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreate(path); err == nil {
		t.Fatal("a corrupt key file was silently replaced — the chain would continue under a new identity")
	}
}

func TestUnreadableKeyIsAnErrorNotAFreshKey(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root ignores the permission bit")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "key.pem")
	k, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, 0o600) })

	got, err := LoadOrCreate(path)
	if err == nil {
		t.Fatalf("an unreadable key produced a usable one (same=%v) — a permission problem must not become a new identity",
			got.Equal(k.Public()))
	}
}

func TestKeyDirectoryIsCreatedWithRestrictivePermissions(t *testing.T) {
	// -state-dir holds private keys and is never the export. If it lands
	// world-readable, every guarantee downstream of the signature is available
	// to anyone on the box.
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "deeper", "key.pem")
	if _, err := LoadOrCreate(path); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm&0o077 != 0 {
		t.Errorf("key directory is %o — group/other can reach the signing key", perm)
	}
	fi, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if perm := fi.Mode().Perm(); perm&0o077 != 0 {
		t.Errorf("key file is %o — group/other can read the signing key", perm)
	}
}

func TestExistingKeyIsReusedNotRegenerated(t *testing.T) {
	// Resuming a chain under a different key makes the export silently stop
	// verifying: the header names one pubkey for the whole file.
	path := filepath.Join(t.TempDir(), "key.pem")
	first, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Equal(second) {
		t.Fatal("LoadOrCreate minted a new key for an existing path — the chain would stop verifying")
	}
}

// Replace is how rotation displaces a live signing key, so its failure paths
// are the ones that decide whether a bad state directory degrades or corrupts.
// It must fail loudly and leave the existing key intact — a half-written or
// missing key file is a deployment that cannot verify its own outstanding
// credentials after the next restart.
func TestReplaceFailsLoudlyAndPreservesTheOldKey(t *testing.T) {
	dir := t.TempDir()

	// The parent of the target is a regular file, which is what pointing
	// -state-dir at a file looks like from here. MkdirAll cannot proceed.
	notADir := filepath.Join(dir, "state")
	if err := os.WriteFile(notADir, []byte("file, not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}
	fresh, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	if err := Replace(filepath.Join(notADir, "key.pem"), fresh); err == nil {
		t.Error("Replace succeeded with a file where its directory should be")
	}

	// And the case that matters most: a failed Replace over an existing key
	// leaves the original readable. Rotation reports the error and keeps
	// signing with what is genuinely on disk.
	path := filepath.Join(dir, "key.pem")
	original, err := LoadOrCreate(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path+".blocked", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := Replace(path+".blocked", fresh); err == nil {
		t.Error("Replace succeeded onto a directory")
	}
	reloaded, err := Load(path)
	if err != nil {
		t.Fatalf("the original key is no longer loadable: %v", err)
	}
	if !reloaded.Equal(original) {
		t.Error("a failed Replace elsewhere disturbed the existing key")
	}

	// No temp files left behind. These are private keys: a .key-*.tmp that
	// survives a failure is key material sitting in the state directory under a
	// name nothing will ever clean up.
	leftovers, _ := filepath.Glob(filepath.Join(dir, ".key-*.tmp"))
	if len(leftovers) != 0 {
		t.Errorf("failed Replace left private key material behind: %v", leftovers)
	}
}
