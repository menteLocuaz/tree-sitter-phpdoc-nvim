#include "tree_sitter/parser.h"

#define TSDEBUG 0

#if TSDEBUG
#else
#define LOG(...)
#endif

enum TokenType {
  TEXT,
  TEXT_AFTER_TYPE,
  TEXT_IN_INLINE_TAG,
  TEXT_NOT_VERSION,
};

static const char *const PEAR_PACKAGE_VERSION = "@package_version@";

// ============================================================================
// Pure Character Predicates (Easily Testable)
// ============================================================================
static inline bool is_newline(int32_t c) {
  return c == '\r' || c == '\n';
}

static inline bool is_whitespace(int32_t c) {
  return c == ' ' || c == '\t' || is_newline(c);
}

static inline bool is_ascii_digit(int32_t c) {
  return c >= '0' && c <= '9';
}

static inline bool is_php_ident_start(int32_t c) {
  return c == '_' ||
         (c >= 'a' && c <= 'z') ||
         (c >= 'A' && c <= 'Z') ||
         (c >= 0x00A1 && c <= 0x00FF);
}

static inline bool is_any_text_symbol_valid(const bool *valid_symbols) {
  return valid_symbols[TEXT] ||
         valid_symbols[TEXT_AFTER_TYPE] ||
         valid_symbols[TEXT_IN_INLINE_TAG] ||
         valid_symbols[TEXT_NOT_VERSION];
}

// ============================================================================
// Lexer Navigation Primitives
// ============================================================================
static inline void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static inline void skip(TSLexer *lexer) {
  lexer->advance(lexer, true);
}

static bool skip_whitespace(TSLexer *lexer) {
  bool skipped = false;
  while (is_whitespace(lexer->lookahead)) {
    skip(lexer);
    skipped = true;
  }
  return skipped;
}

/**
 * Skips the newline prefix inside a PHPDoc comment (e.g. "\n  * ").
 * Returns false if characters other than [\r\n *] appear before finding "* ".
 */
static bool skip_to_text_start(TSLexer *lexer) {
  bool asterisk_found = false;
  while (true) {
    switch (lexer->lookahead) {
      case '\r':
      case '\n':
        skip(lexer);
        asterisk_found = false;
        break;
      case ' ':
        if (asterisk_found) {
          return true;
        }
        skip(lexer);
        break;
      case '*':
        skip(lexer);
        asterisk_found = true;
        break;
      default:
        return false;
    }
  }
}

// ============================================================================
// Lexical Disambiguation Sub-scanners
// ============================================================================

/**
 * Detects whether the stream starts with a valid PHP variable name (e.g. $ab_cde).
 */
static bool scan_variable_name(TSLexer *lexer, bool *has_content) {
  if (skip_whitespace(lexer)) {
    *has_content = true;
  }
  if (lexer->lookahead != '$') {
    return false;
  }
  advance(lexer);

  while (true) {
    int32_t c = lexer->lookahead;
    if (is_php_ident_start(c) || (*has_content && is_ascii_digit(c))) {
      *has_content = true;
      advance(lexer);
    } else {
      return *has_content;
    }
  }
}

static bool match_exact_literal(TSLexer *lexer, const char *literal) {
  while (*literal != '\0') {
    if (*literal != lexer->lookahead) {
      return false;
    }
    literal++;
    advance(lexer);
  }
  return true;
}

/**
 * Detects whether the stream starts with a valid version string:
 * - Semver / numeric: "1.2.3", "1.blabla-x"
 * - VCS vector: "vcs: $some_vector$" or "$some_vector$"
 * - PEAR macro: "@package_version@"
 */
static bool scan_version(TSLexer *lexer, bool *has_content) {
  skip_whitespace(lexer);
  bool numeric_started = false;
  bool vcs_started = false;
  bool vcs_complete = false;
  bool vector_started = false;

  while (true) {
    switch (lexer->lookahead) {
      case '\r':
      case '\n':
      case '\0':
        return false;

      case '.':
        if (numeric_started) {
          return true;
        }
        break;

      case ' ':
        if (!vcs_complete) {
          return false;
        }
        break;

      case ':':
        if (vcs_started) {
          vcs_complete = true;
        }
        break;

      case '@':
        return match_exact_literal(lexer, PEAR_PACKAGE_VERSION);

      case '$':
        if (vector_started) {
          return true;
        }
        if (!*has_content || vcs_complete) {
          vector_started = true;
        }
        /* INTENTIONAL FALLTHROUGH FROM THE ORIGINAL CODE */

      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        if (!*has_content) {
          numeric_started = true;
        }
        break;

      default:
        if (!*has_content) {
          vcs_started = true;
        }
        break;
    }
    advance(lexer);
    *has_content = true;
  }
}

/**
 * Scans general text content until the end of the line, the end of the comment,
 * the start of an inline tag ("{@"), or the end of an inline tag ("}").
 */
static bool scan_text(TSLexer *lexer, bool is_inline, bool has_content) {
  while (true) {
    lexer->mark_end(lexer);

    switch (lexer->lookahead) {
      case '\0':
        return false;

      case '\r':
      case '\n':
        return has_content;

      case '@':
      case '\\':
        if (!has_content) {
          return false;
        }
        break;

      case '{':
        advance(lexer);
        if (lexer->lookahead == '@') {
          return has_content;
        }
        break;

      case '}':
        if (is_inline) {
          return has_content;
        }
        break;

      case ' ':
        advance(lexer);
        switch (lexer->lookahead) {
          case '*':
            while (lexer->lookahead == '*') {
              advance(lexer);
            }
            if (lexer->lookahead == '/') {
              return has_content;
            }
            break;

          case '{':
            advance(lexer);
            if (lexer->lookahead == '@') {
              return has_content;
            }
            break;
        }
        break;
    }
    has_content = true;
    advance(lexer);
  }
}

// ============================================================================
// Tree-sitter ABI Lifecycle and Entry Point
// ============================================================================
void *tree_sitter_phpdoc_external_scanner_create(void) { return NULL; }

void tree_sitter_phpdoc_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_phpdoc_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_phpdoc_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_phpdoc_external_scanner_scan(
    void *payload,
    TSLexer *lexer,
    const bool *valid_symbols
) {
  (void)payload;

  LOG("scanner called text:%d text_after_type:%d text_in_inline_tag:%d text_not_version:%d\n",
      valid_symbols[TEXT],
      valid_symbols[TEXT_AFTER_TYPE],
      valid_symbols[TEXT_IN_INLINE_TAG],
      valid_symbols[TEXT_NOT_VERSION]);

  if (!is_any_text_symbol_valid(valid_symbols)) {
    LOG("scanner detected:nothing return:0\n");
    return false;
  }

  bool skipped_nl = false;
  bool has_content = false;

  if (is_newline(lexer->lookahead)) {
    if (!skip_to_text_start(lexer)) {
      return false;
    }
    skipped_nl = true;
  }

  // Every text node requires a mandatory preceding space
  if (lexer->lookahead != ' ') {
    return false;
  }
  skip(lexer);

  if (valid_symbols[TEXT] && scan_text(lexer, false, has_content)) {
    lexer->result_symbol = TEXT;
    LOG("  scanner detected:text return:1\n");
    return true;
  }

  if (valid_symbols[TEXT_AFTER_TYPE]) {
    lexer->result_symbol = TEXT_AFTER_TYPE;
    if (scan_variable_name(lexer, &has_content)) {
      LOG("  scanner detected:variable_name return:0\n");
      return false;
    }
    skip_whitespace(lexer);
    if (scan_text(lexer, false, has_content)) {
      LOG("  scanner detected:text_after_type return:1\n");
      return true;
    }
  }

  if (valid_symbols[TEXT_IN_INLINE_TAG] && scan_text(lexer, true, has_content)) {
    lexer->result_symbol = TEXT_IN_INLINE_TAG;
    LOG("  scanner detected:text_in_inline_tag return:1\n");
    return true;
  }

  if (valid_symbols[TEXT_NOT_VERSION]) {
    lexer->result_symbol = TEXT_NOT_VERSION;
    if (!skipped_nl && scan_version(lexer, &has_content)) {
      LOG("  scanner detected:version return:0\n");
      return false;
    }
    if (scan_text(lexer, false, has_content)) {
      LOG("  scanner detected:text_not_version return:1\n");
      return true;
    }
  }

  LOG("scanner detected:nothing return:0\n");
  return false;
}