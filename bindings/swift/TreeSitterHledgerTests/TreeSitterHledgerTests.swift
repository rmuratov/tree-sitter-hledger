import XCTest
import SwiftTreeSitter
import TreeSitterHledger

final class TreeSitterHledgerTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_hledger())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading hledger grammar")
    }
}
