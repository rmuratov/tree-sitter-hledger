package tree_sitter_hledger_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_hledger "github.com/rmuratov/tree-sitter-hledger/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_hledger.Language())
	if language == nil {
		t.Errorf("Error loading hledger grammar")
	}
}
