const PHP = require("tree-sitter-php/php/grammar").grammar;

// ============================================================================
// Lexical Constants and Regular Expressions
// ============================================================================
const REGEX = {
  LINE_CONTINUATION_STARS: seq(/\r?\n/, /[ \t]*/, repeat(seq("*", /[ \t]*/))),
  WHITESPACE: /\s/,
  DOC_BEGIN: seq("/**", repeat("*")),
  DIGITS: /\d+/,
  AUTHOR_NAME: /\S+( [^\s<]+)*/,
  EMAIL_ADDRESS: /\S+@\S+\.[^\s>]+/,
  SEMVER_LIKE: /\d+\.[^\s]+/,
  VCS_PREFIX: /[a-zA-Z-_]+: */,
  VERSION_VECTOR: /\$[a-zA-Z_][a-zA-Z0-9-_]*\$/,
  URI: /https?:\/\/[^\s}]+/,
  DEFAULT_VALUE: /[^, ][^,)]*/,
};

// ============================================================================
// Tag and Type Dictionaries
// ============================================================================
const TAGS = {
  WITHOUT_DESCRIPTION: ["@api", "@filesource", "@inheritdoc", "@inheritDoc"],
  OPTIONAL_DESCRIPTION: ["@ignore", "@internal"],
  REQUIRED_DESCRIPTION: ["@category", "@copyright", "@todo"],
  INCOMPLETE: [
    "@example",
    "@license",
    "@package",
    "@source",
    "@subpackage",
    "@uses",
  ],
  PROPERTY: ["@property", "@property-read", "@property-write"],
  TEMPLATE: ["@template", "@psalm-template", "@phpstan-template"],
  IMPLEMENTS: ["@implements", "@template-implements"],
  EXTENDS: ["@extends", "@template-extends"],
  USE: ["@use", "@template-use"],
  PHPUNIT: [
    "@after",
    "@afterClass",
    "@annotation",
    "@backupGlobals",
    "@backupStaticAttributes",
    "@before",
    "@beforeClass",
    "@codeCoverageIgnore",
    "@codeCoverageIgnore*",
    "@codeCoverageIgnoreEnd",
    "@codeCoverageIgnoreStart",
    "@covers",
    "@coversDefaultClass",
    "@coversDefaultClass to shorten annotations",
    "@coversNothing",
    "@dataProvider",
    "@depends",
    "@depends annotation to express dependencies",
    "@doesNotPerformAssertions",
    "@group",
    "@large",
    "@medium",
    "@preserveGlobalState",
    "@requires",
    "@requires usages",
    "@runInSeparateProcess",
    "@runTestsInSeparateProcesses",
    "@small",
    "@test",
    "@testWith",
    "@testdox",
    "@ticket",
  ],
  PSALM_SIMPLE: [
    "@psalm-consistent-constructor",
    "@psalm-consistent-templates",
    "@psalm-var",
    "@psalm-param",
    "@psalm-return",
    "@psalm-property",
    "@psalm-property-read",
    "@psalm-property-write",
    "@psalm-method",
    "@psalm-ignore-var",
    "@psalm-if-this-is",
    "@psalm-this-out",
    "@psalm-ignore-nullable-return",
    "@psalm-ignore-falsable-return",
    "@psalm-seal-properties",
    "@psalm-readonly",
    "@readonly",
    "@psalm-mutation-free",
    "@psalm-external-mutation-free",
    "@psalm-immutable",
    "@psalm-pure",
    "@psalm-allow-private-mutation",
    "@psalm-readonly-allow-private-mutation",
    "@psalm-trace",
    "@no-named-arguments",
  ],
  PSALM_PARAM_OUT: ["@param-out", "@psalm-param-out"],
  PSALM_ASSERT: [
    "@psalm-assert",
    "@psalm-assert-if-true",
    "@psalm-assert-if-false",
  ],
  PSALM_NAMED_TYPE: [
    "@psalm-suppress",
    "@psalm-internal",
    "@psalm-require-extends",
    "@psalm-require-implements",
  ],
};

const PSALM_SCALAR_STRINGS = [
  "interface-string",
  "positive-int",
  "trait-string",
  "enum-string",
  "callable-string",
  "numeric-string",
  "literal-string",
  "lowercase-string",
  "non-empty-string",
  "non-empty-lowercase-string",
];

const INHERITED_PHP_RULES = [
  "name",
  "namespace_name",
  "relative_name",
  "optional_type",
  "primitive_type",
  "qualified_name",
  "union_type",
  "intersection_type",
  "disjunctive_normal_form_type",
  "variable_name",
];

// ============================================================================
// DSL Helper Functions (Unit-Testable)
// ============================================================================
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function sep(rule, separator) {
  return optional(sep1(rule, separator));
}

/**
 * Wraps a tag or list of tags in a `$.tag_name` alias.
 * Preserves the exact structure of the original AST.
 */
function aliasTagName($, tagOrTags) {
  const rule = Array.isArray(tagOrTags) ? choice(...tagOrTags) : tagOrTags;
  return alias(rule, $.tag_name);
}

/**
 * Builds the version + description pattern used in @deprecated, @since and @version.
 */
function versionAndDescriptionChoice($) {
  return choice(
    $.version,
    $._description_not_version,
    seq($.version, $.description),
  );
}

/**
 * Generates the map of rules inherited directly from `tree-sitter-php`.
 */
function inheritPhpRules(ruleNames) {
  return Object.fromEntries(
    ruleNames.map((name) => [name, () => PHP.rules[name]]),
  );
}

// ============================================================================
// Rule Subsets by Domain
// ============================================================================
const descriptionRules = {
  description: ($) => repeat1(choice($.text, $.inline_tag)),

  _description_after_type: ($) =>
    alias(
      repeat1(choice(alias($._text_after_type, $.text), $.inline_tag)),
      $.description,
    ),

  _description_not_version: ($) =>
    alias(
      repeat1(choice(alias($._text_not_version, $.text), $.inline_tag)),
      $.description,
    ),

  _description_in_inline_tag: ($) =>
    alias(repeat1(alias($._text_in_inline_tag, $.text)), $.description),

  _description_in_inline_tag_with_nesting: ($) =>
    alias(
      repeat1(choice(alias($._text_in_inline_tag, $.text), $.inline_tag)),
      $.description,
    ),
};

const tagRules = {
  tag: ($) =>
    choice(
      $._tag_without_description,
      $._tag_with_optional_description,
      $._tag_with_required_description,
      $._author_tag,
      $._deprecated_tag,
      $._global_tag,
      $._link_tag,
      $._method_tag,
      $._param_tag,
      $._property_tag,
      $._return_tag,
      $._see_tag,
      $._since_tag,
      $._throws_tag,
      $._var_tag,
      $._version_tag,
      $._phpunit_tag,
      $._tag_with_incomplete_implementation,
      $._generic_template_tag,
      $._generic_implements_tag,
      $._generic_extends_tag,
      $._generic_use_tag,
      $._psalm_tag,
      $._mixin_tag,
    ),

  inline_tag: ($) =>
    seq(
      "{",
      choice(
        aliasTagName($, "@inheritdoc"),
        aliasTagName($, "@inheritDoc"),
        $._inline_internal_tag,
        $._inline_link_tag,
        $._inline_see_tag,
      ),
      "}",
    ),

  _tag_without_description: ($) => aliasTagName($, TAGS.WITHOUT_DESCRIPTION),

  _tag_with_optional_description: ($) =>
    seq(aliasTagName($, TAGS.OPTIONAL_DESCRIPTION), optional($.description)),

  _tag_with_required_description: ($) =>
    seq(aliasTagName($, TAGS.REQUIRED_DESCRIPTION), $.description),

  _tag_with_incomplete_implementation: ($) =>
    seq(aliasTagName($, TAGS.INCOMPLETE), optional($.description)),

  _author_tag: ($) =>
    seq(
      aliasTagName($, "@author"),
      $.author_name,
      optional(seq("<", $.email_address, ">")),
    ),

  _global_tag: ($) => seq(aliasTagName($, "@global"), $._type, $.variable_name),

  _inline_internal_tag: ($) =>
    seq(
      aliasTagName($, "@internal"),
      optional($._description_in_inline_tag_with_nesting),
    ),

  _link_tag: ($) =>
    seq(aliasTagName($, "@link"), $.uri, optional($.description)),

  _inline_link_tag: ($) =>
    seq(
      aliasTagName($, "@link"),
      $.uri,
      optional($._description_in_inline_tag),
    ),

  _method_tag: ($) =>
    seq(
      aliasTagName($, "@method"),
      optional($.static),
      optional($._type),
      $.name,
      $.parameters,
      optional($.description),
    ),

  _param_tag: ($) =>
    seq(
      aliasTagName($, "@param"),
      optional($._type),
      $.variable_name,
      optional($.description),
    ),

  _property_tag: ($) =>
    seq(
      aliasTagName($, TAGS.PROPERTY),
      $._type,
      $.variable_name,
      optional($.description),
    ),

  _return_tag: ($) =>
    seq(
      aliasTagName($, "@return"),
      $._type,
      optional($._description_after_type),
    ),

  _see_tag: ($) =>
    seq(
      aliasTagName($, "@see"),
      choice($.uri, $.fqsen),
      optional($.description),
    ),

  _inline_see_tag: ($) =>
    seq(
      aliasTagName($, "@see"),
      choice($.uri, $.fqsen),
      optional($._description_in_inline_tag),
    ),

  _throws_tag: ($) =>
    seq(
      aliasTagName($, "@throws"),
      $._type,
      optional($._description_after_type),
    ),

  _var_tag: ($) =>
    seq(
      aliasTagName($, "@var"),
      $._type,
      optional(
        choice(
          $._description_after_type,
          $.variable_name,
          seq($.variable_name, $.description),
        ),
      ),
    ),

  _deprecated_tag: ($) =>
    seq(
      aliasTagName($, "@deprecated"),
      optional(versionAndDescriptionChoice($)),
    ),

  _since_tag: ($) =>
    seq(aliasTagName($, "@since"), versionAndDescriptionChoice($)),

  _version_tag: ($) =>
    seq(aliasTagName($, "@version"), versionAndDescriptionChoice($)),

  _generic_template_tag: ($) =>
    seq(
      aliasTagName($, TAGS.TEMPLATE),
      choice($._type, seq($._type, "of", $._type)),
    ),

  _generic_implements_tag: ($) =>
    seq(aliasTagName($, TAGS.IMPLEMENTS), $._type),

  _generic_extends_tag: ($) => seq(aliasTagName($, TAGS.EXTENDS), $._type),

  _generic_use_tag: ($) => seq(aliasTagName($, TAGS.USE), $._type),

  _phpunit_tag: ($) =>
    seq(aliasTagName($, TAGS.PHPUNIT), optional($.description)),

  _psalm_tag: ($) =>
    choice(
      aliasTagName($, TAGS.PSALM_SIMPLE),
      seq(aliasTagName($, ["@psalm-trace"]), $.variable_name),
      seq(aliasTagName($, TAGS.PSALM_PARAM_OUT), $._type, $.variable_name),
      seq(aliasTagName($, TAGS.PSALM_ASSERT), $._type, choice($.variable_name)),
      seq(
        aliasTagName($, "@psalm-import-type"),
        $.named_type,
        "from",
        $.named_type,
        optional(seq("as", $.named_type)),
      ),
      seq(aliasTagName($, TAGS.PSALM_NAMED_TYPE), $.named_type),
    ),

  _mixin_tag: ($) => seq(aliasTagName($, "@mixin"), $._type),
};

const typeRules = {
  _type: () => PHP.rules.type,

  _types: ($) =>
    choice(
      $._regular_types,
      alias($._psalm_scalar_type, $.primitive_type),
      alias($._phpdoc_array_types, $.array_type),
      alias($._psalm_generic_array_types, $.array_type),
      alias($._psalm_list_array_types, $.array_type),
      alias($._psalm_shaped_array_types, $.array_type),
    ),

  _regular_types: () => PHP.rules._types,

  _phpdoc_array_types: ($) => seq($._regular_types, repeat1("[]")),

  _psalm_generic_array_types: ($) =>
    seq(
      field("array", $._regular_types),
      "<",
      field("key", $._types),
      ",",
      field("value", $._types),
      ">",
    ),

  _psalm_list_array_types: ($) =>
    seq(
      field("array", choice(alias("list", $.primitive_type), $._regular_types)),
      "<",
      field("value", $._types),
      ">",
    ),

  _psalm_shaped_array_types: ($) =>
    prec(
      2,
      seq(
        choice("array", "list"),
        "{",
        sep1(alias($._shaped_array_element, $.array_element), ","),
        "}",
      ),
    ),

  _shaped_array_element: ($) =>
    seq(
      field(
        "key",
        optional(
          seq(
            choice(
              $.name,
              seq("'", $.name, "'"),
              seq('"', $.name, '"'),
              alias(REGEX.DIGITS, $.name),
            ),
            optional("?"),
            ":",
          ),
        ),
      ),
      field("value", $._regular_types),
    ),

  _psalm_scalar_type: ($) =>
    choice(
      seq("class-string", optional($._type_argument_named_type)),
      ...PSALM_SCALAR_STRINGS,
    ),

  generic_type: ($) => seq(PHP.rules.named_type, $._type_argument_list),

  _type_argument_list: ($) =>
    seq("<", choice(repeat(","), sep(",", $._type)), ">"),

  _type_argument_named_type: ($) => seq("<", $.named_type, ">"),

  named_type: ($) => choice(PHP.rules.named_type, $.generic_type),

  ...inheritPhpRules(INHERITED_PHP_RULES),
};

const primitiveAndTerminalRules = {
  author_name: () => REGEX.AUTHOR_NAME,
  email_address: () => REGEX.EMAIL_ADDRESS,

  version: ($) =>
    choice(
      REGEX.SEMVER_LIKE,
      $._version_vector,
      seq(REGEX.VCS_PREFIX, $._version_vector),
      "@package_version@",
    ),

  _version_vector: () => REGEX.VERSION_VECTOR,
  uri: () => REGEX.URI,

  fqsen: ($) =>
    choice(
      $.named_type,
      $.variable_name,
      seq($.name, "()"),
      seq($.named_type, "::", $.name),
      seq($.named_type, "::", $.name, "()"),
      seq($.named_type, "::", $.variable_name),
    ),

  parameters: ($) => seq("(", sep($.parameter, ","), ")"),

  parameter: ($) =>
    seq(
      optional($._type),
      $.variable_name,
      optional(seq("=", $.default_value)),
    ),

  default_value: () => REGEX.DEFAULT_VALUE,
  static: () => "static",
  _end: () => "*/",
};

// ============================================================================
// Public Grammar Definition
// ============================================================================
module.exports = grammar({
  name: "phpdoc",

  extras: () => [
    token(choice(REGEX.LINE_CONTINUATION_STARS, REGEX.WHITESPACE)),
  ],

  conflicts: ($) => [
    [$.namespace_name],
    [$.named_type, $.generic_type],
    [$._type_argument_list],
    [
      $._type,
      $.union_type,
      $.intersection_type,
      $.disjunctive_normal_form_type,
    ],
    [$.union_type, $.disjunctive_normal_form_type],
  ],

  externals: ($) => [
    $.text,
    $._text_after_type,
    $._text_in_inline_tag,
    $._text_not_version,
  ],

  word: ($) => $.name,

  rules: {
    document: ($) =>
      seq($._begin, optional($.description), repeat($.tag), $._end),
    _begin: () => token(REGEX.DOC_BEGIN),

    ...descriptionRules,
    ...tagRules,
    ...typeRules,
    ...primitiveAndTerminalRules,
  },
});
