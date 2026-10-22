package edge_test

import (
	"crypto/tls"
	"crypto/x509"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/quic-go/quic-go/http3"
)

func TestHTTP3RoundTrip(t *testing.T) {
	fixture := httptest.NewTLSServer(http.NotFoundHandler())
	defer fixture.Close()
	roots := x509.NewCertPool()
	roots.AddCert(fixture.Certificate())
	socket, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer socket.Close()
	server := &http3.Server{TLSConfig: fixture.TLS.Clone(), Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ProtoMajor != 3 || r.URL.Path != "/ready" {
			http.Error(w, "protocol", http.StatusBadRequest)
			return
		}
		_, _ = io.WriteString(w, "http3-ready")
	})}
	done := make(chan struct{})
	go func() { defer close(done); _ = server.Serve(socket) }()
	defer func() {
		_ = server.Close()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Error("HTTP/3 server did not stop")
		}
	}()
	transport := &http3.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS13}}
	defer transport.Close()
	client := &http.Client{Transport: transport, Timeout: 10 * time.Second}
	response, err := client.Get("https://" + socket.LocalAddr().String() + "/ready")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.ProtoMajor != 3 || response.StatusCode != http.StatusOK || string(body) != "http3-ready" {
		t.Fatalf("unexpected HTTP/3 response: %s %d %q", response.Proto, response.StatusCode, body)
	}
}
