package edge_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"cel.dev/cel-go/cel"
	"cel.dev/cel-go/common/types/ref"
	"cel.dev/cel-go/ext"
	"github.com/caddyserver/caddy/v2"
	"github.com/caddyserver/caddy/v2/modules/caddyhttp"
	_ "github.com/caddyserver/caddy/v2/modules/standard"
)

type ClubProfile struct {
	Name   string `json:"name"`
	Secret string `json:"-"`
}

type legacyPathMatcher struct{ path string }

var legacyFactoryCalls int

func init() {
	caddy.RegisterModule(legacyPathMatcher{})
}

func (legacyPathMatcher) CaddyModule() caddy.ModuleInfo {
	return caddy.ModuleInfo{
		ID:  "http.matchers.club_test_legacy",
		New: func() caddy.Module { return new(legacyPathMatcher) },
	}
}

func (m legacyPathMatcher) Match(request *http.Request) bool {
	return request.URL.Path == m.path
}

func (legacyPathMatcher) CELLibrary(caddy.Context) (cel.Library, error) {
	return caddyhttp.CELMatcherImpl(
		"club_test_legacy", "club_test_legacy_request_string", []*cel.Type{cel.StringType},
		caddyhttp.CELMatcherFactory(func(data ref.Val) (caddyhttp.RequestMatcher, error) {
			legacyFactoryCalls++
			return legacyPathMatcher{path: data.Value().(string)}, nil
		}),
	)
}

func TestNativeTypesPreservesJSONPrivacy(t *testing.T) {
	env, err := cel.NewEnv(
		ext.NativeTypes(reflect.TypeFor[ClubProfile](), ext.ParseStructTag("json")),
		cel.Variable("profile", cel.DynType),
	)
	if err != nil {
		t.Fatal(err)
	}
	profile := ClubProfile{Name: "alumnus", Secret: "private-fixture"}
	for _, expr := range []string{`profile.Secret`, `profile["Secret"]`, `profile["-"]`} {
		t.Run(expr, func(t *testing.T) {
			ast, issues := env.Compile(expr)
			if issues.Err() != nil {
				return
			}
			program, err := env.Program(ast)
			if err != nil {
				t.Fatal(err)
			}
			if value, _, err := program.Eval(map[string]any{"profile": profile}); err == nil {
				t.Fatalf("hidden JSON field was available: %v", value)
			}
		})
	}
	ast, issues := env.Compile(`profile.name == "alumnus"`)
	if issues.Err() != nil {
		t.Fatal(issues.Err())
	}
	program, err := env.Program(ast)
	if err != nil {
		t.Fatal(err)
	}
	value, _, err := program.Eval(map[string]any{"profile": profile})
	if err != nil || value.Value() != true {
		t.Fatalf("public JSON field failed: value=%v error=%v", value, err)
	}
}

func TestCaddyCELRequestMatchers(t *testing.T) {
	ctx, cancel := caddy.NewContext(caddy.Context{Context: context.Background()})
	defer cancel()
	for _, expr := range []string{
		`path("/allowed") && method("GET")`,
		`path_regexp("^/allowed$") && method("GET")`,
		`club_test_legacy("/allowed") && method("GET")`,
	} {
		t.Run(expr, func(t *testing.T) {
			factoryCallsBefore := legacyFactoryCalls
			matcher := caddyhttp.MatchExpression{Expr: expr}
			if err := matcher.Provision(ctx); err != nil {
				t.Fatal(err)
			}
			if expr == `club_test_legacy("/allowed") && method("GET")` && legacyFactoryCalls != factoryCallsBefore+1 {
				t.Fatal("legacy factory was not compiled into the expression")
			}
			factoryCallsAfterProvision := legacyFactoryCalls
			for _, path := range []string{"/allowed", "/denied"} {
				request := httptest.NewRequest("GET", "https://club.example"+path, nil)
				request = request.WithContext(context.WithValue(request.Context(), caddy.ReplacerCtxKey, caddy.NewReplacer()))
				match, err := matcher.MatchWithError(request)
				if err != nil || match != (path == "/allowed") {
					t.Fatalf("path=%s match=%v error=%v", path, match, err)
				}
			}
			if legacyFactoryCalls != factoryCallsAfterProvision {
				t.Fatal("constant legacy matcher was provisioned again during evaluation")
			}
		})
	}
}
