<?php
namespace App\Core;

use PDO;

/**
 * Runs a .sql file statement by statement. A real tokenizer (not a regex): semicolons inside '…', "…", `…`,
 * -- comments, # comments and /* … *\/ comments never end a statement, and backslash escapes inside quotes are kept.
 */
final class SqlRunner
{
    /** @return string[] */
    public static function split(string $sql): array
    {
        $out = []; $buf = ''; $len = strlen($sql); $quote = null;
        for ($i = 0; $i < $len; $i++) {
            $c = $sql[$i];
            if ($quote !== null) {
                $buf .= $c;
                if ($c === '\\' && $quote !== '`' && $i + 1 < $len) { $buf .= $sql[++$i]; continue; }
                if ($c === $quote) {
                    if ($i + 1 < $len && $sql[$i + 1] === $quote) { $buf .= $sql[++$i]; continue; } // '' escape
                    $quote = null;
                }
                continue;
            }
            if ($c === "'" || $c === '"' || $c === '`') { $quote = $c; $buf .= $c; continue; }
            if ($c === '-' && ($sql[$i + 1] ?? '') === '-' && (($sql[$i + 2] ?? ' ') === ' ' || ($sql[$i + 2] ?? '') === "\n" || ($sql[$i + 2] ?? '') === "\t")) {
                while ($i < $len && $sql[$i] !== "\n") $i++;
                $buf .= "\n"; continue;
            }
            if ($c === '#') { while ($i < $len && $sql[$i] !== "\n") $i++; $buf .= "\n"; continue; }
            if ($c === '/' && ($sql[$i + 1] ?? '') === '*') {
                $end = strpos($sql, '*/', $i + 2);
                $i = $end === false ? $len : $end + 1;
                $buf .= ' '; continue;
            }
            if ($c === ';') { if (trim($buf) !== '') $out[] = trim($buf); $buf = ''; continue; }
            $buf .= $c;
        }
        if (trim($buf) !== '') $out[] = trim($buf);
        return $out;
    }

    public static function runFile(PDO $pdo, string $file): int
    {
        $n = 0;
        foreach (self::split((string)file_get_contents($file)) as $stmt) { $pdo->exec($stmt); $n++; }
        return $n;
    }
}
