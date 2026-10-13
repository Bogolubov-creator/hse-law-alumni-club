package edge_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/klauspost/compress/zstd"
)

func TestChiRejectsForgedClientIP(t *testing.T) {
	handler := middleware.ClientIPFromXFF("198.51.100.0/24")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if middleware.GetClientIP(r.Context()) != "10.0.0.7" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	for _, scenario := range []struct {
		name   string
		peer   string
		header string
		status int
	}{
		{"trusted proxy", "198.51.100.42:47287", "10.0.0.7", http.StatusOK},
		{"untrusted peer", "203.0.113.15:47287", "10.0.0.7, 198.51.100.42", http.StatusForbidden},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/admin", nil)
			request.RemoteAddr = scenario.peer
			request.Header.Set("X-Forwarded-For", scenario.header)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != scenario.status {
				t.Fatalf("status = %d, want %d", response.Code, scenario.status)
			}
		})
	}
}

func TestZstdTwoBlockFrameDoesNotPanic(t *testing.T) {
	frame := []byte{0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x38, 0x74, 0x06, 0x00, 0x42, 0xb8, 0x32, 0x0d, 0x1a, 0x00, 0x00, 0x00, 0x90, 0xaf, 0xfa, 0xff, 0x03, 0x00, 0x80, 0xff, 0x7f}
	frame = append(frame, bytes.Repeat([]byte{0xa5, 0x94, 0x52, 0x4a, 0x29}, 37)...)
	frame = append(frame, []byte{0xa5, 0x94, 0x12, 0x00, 0xad, 0x56, 0x03, 0xee, 0xff, 0xdf, 0xb3, 0x1a, 0x1c, 0x1a, 0x00, 0xe0, 0xff, 0x1f, 0x0f, 0xb1, 0x9c, 0x5a, 0xcf, 0x4d, 0xe4, 0x1d, 0x7b, 0xab, 0x99, 0x5e, 0x01, 0x51, 0xa4, 0x73, 0xd8, 0xb1, 0xf3, 0x39, 0x4b, 0x67, 0xf6, 0xab, 0x1a, 0xab, 0x1a, 0xab, 0x1a}...)
	frame = append(frame, bytes.Repeat([]byte{0x8c, 0x31, 0xc6, 0x18, 0x63}, 1365)...)
	frame = append(frame, 0x8c, 0x31)
	frame = append(frame, bytes.Repeat([]byte{0x63, 0x8c, 0x31, 0xc6, 0x18}, 1365)...)
	frame = append(frame, 0x63, 0x2c)
	frame = append(frame, bytes.Repeat([]byte{0x31, 0xc6, 0x18, 0x63, 0x8c}, 1365)...)
	frame = append(frame, 0x31, 0x46)
	frame = append(frame, bytes.Repeat([]byte{0x31, 0xc6, 0x18, 0x63, 0x8c}, 1365)...)
	frame = append(frame, 0x31, 0x06, 0x00)
	decoder, err := zstd.NewReader(nil)
	if err != nil {
		t.Fatal(err)
	}
	defer decoder.Close()
	defer func() {
		if failure := recover(); failure != nil {
			t.Fatalf("decoder panic: %v", failure)
		}
	}()
	_, _ = decoder.DecodeAll(frame, make([]byte, 0, 100*1024))
}
