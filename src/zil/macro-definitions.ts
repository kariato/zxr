// Semantic spellings of the pinned MIT Zork II definitions.
// Guard hand ports against silently accepting different programs under the same names.
// Copyright (c) 2025 Microsoft, MIT; notice: reference/zork2/LICENSE.
// Provenance: reference/zork2/PROVENANCE.md.
export const supportedDefinitions:Readonly<Record<string,string>> = {
  "TELL": "<DEFMAC TELL (\"ARGS\" A) <FORM PROG () !<MAPF ,LIST <FUNCTION (\"AUX\" E P O) <COND (<EMPTY? .A> <MAPSTOP>) (<SET E <NTH .A 1>> <SET A <REST .A>>)> <COND (<TYPE? .E ATOM> <COND (<OR <=? <SET P <SPNAME .E>> \"CRLF\"> <=? .P \"CR\">> <MAPRET '<CRLF>>) (<EMPTY? .A> <ERROR INDICATOR-AT-END? .E>) (ELSE <SET O <NTH .A 1>> <SET A <REST .A>> <COND (<OR <=? <SET P <SPNAME .E>> \"DESC\"> <=? .P \"D\"> <=? .P \"OBJ\"> <=? .P \"O\">> <MAPRET <FORM PRINTD .O>>) (<OR <=? .P \"A\"> <=? .P \"AN\">> <MAPRET <FORM PRINTA .O>>) (<OR <=? .P \"NUM\"> <=? .P \"N\">> <MAPRET <FORM PRINTN .O>>) (<OR <=? .P \"CHAR\"> <=? .P \"CHR\"> <=? .P \"C\">> <MAPRET <FORM PRINTC .O>>) (ELSE <MAPRET <FORM PRINT <FORM GETP .O .E>>>)>)>) (<TYPE? .E STRING ZSTRING> <MAPRET <FORM PRINTI .E>>) (<TYPE? .E FORM LVAL GVAL> <MAPRET <FORM PRINT .E>>) (ELSE <ERROR UNKNOWN-TYPE .E>)>>>>>",
  "VERB?": "<DEFMAC VERB? (\"ARGS\" ATMS) <MULTIFROB PRSA .ATMS>>",
  "PRSO?": "<DEFMAC PRSO? (\"ARGS\" ATMS) <MULTIFROB PRSO .ATMS>>",
  "PRSI?": "<DEFMAC PRSI? (\"ARGS\" ATMS) <MULTIFROB PRSI .ATMS>>",
  "ROOM?": "<DEFMAC ROOM? (\"ARGS\" ATMS) <MULTIFROB HERE .ATMS>>",
  "MULTIFROB": "<DEFINE MULTIFROB (X ATMS \"AUX\" (OO (OR)) (O .OO) (L ()) ATM) <REPEAT () <COND (<EMPTY? .ATMS> <RETURN!- <COND (<LENGTH? .OO 1> <ERROR .X>) (<LENGTH? .OO 2> <NTH .OO 2>) (ELSE <CHTYPE .OO FORM>)>>)> <REPEAT () <COND (<EMPTY? .ATMS> <RETURN!->)> <SET ATM <NTH .ATMS 1>> <SET L (<COND (<TYPE? .ATM ATOM> <FORM GVAL <COND (<==? .X PRSA> <PARSE <STRING \"V?\" <SPNAME .ATM>>>) (ELSE .ATM)>>) (ELSE .ATM)> !.L)> <SET ATMS <REST .ATMS>> <COND (<==? <LENGTH .L> 3> <RETURN!->)>> <SET O <REST <PUTREST .O (<FORM EQUAL? <FORM GVAL .X> !.L>)>>> <SET L ()>>>",
  "BSET": "<DEFMAC BSET ('OBJ \"ARGS\" BITS) <MULTIBITS FSET .OBJ .BITS>>",
  "BCLEAR": "<DEFMAC BCLEAR ('OBJ \"ARGS\" BITS) <MULTIBITS FCLEAR .OBJ .BITS>>",
  "BSET?": "<DEFMAC BSET? ('OBJ \"ARGS\" BITS) <MULTIBITS FSET? .OBJ .BITS>>",
  "MULTIBITS": "<DEFINE MULTIBITS (X OBJ ATMS \"AUX\" (O ()) ATM) <REPEAT () <COND (<EMPTY? .ATMS> <RETURN!- <COND (<LENGTH? .O 1> <NTH .O 1>) (<==? .X FSET?> <FORM OR !.O>) (ELSE <FORM PROG () !.O>)>>)> <SET ATM <NTH .ATMS 1>> <SET ATMS <REST .ATMS>> <SET O (<FORM .X .OBJ <COND (<TYPE? .ATM FORM> .ATM) (ELSE <FORM GVAL .ATM>)>> !.O)>>>",
  "RFATAL": "<DEFMAC RFATAL () '<PROG () <PUSH 2> <RSTACK>>>",
  "PROB": "<DEFMAC PROB ('BASE? \"OPTIONAL\" 'LOSER?) <COND (<ASSIGNED? LOSER?> <FORM ZPROB .BASE?>) (ELSE <FORM G? .BASE? '<RANDOM 100>>)>>",
  "ENABLE": "<DEFMAC ENABLE ('INT) <FORM PUT .INT ,C-ENABLED? 1>>",
  "DISABLE": "<DEFMAC DISABLE ('INT) <FORM PUT .INT ,C-ENABLED? 0>>",
  "FLAMING?": "<DEFMAC FLAMING? ('OBJ) <FORM AND <FORM FSET? .OBJ ',FLAMEBIT> <FORM FSET? .OBJ ',ONBIT>>>",
  "OPENABLE?": "<DEFMAC OPENABLE? ('OBJ) <FORM OR <FORM FSET? .OBJ ',DOORBIT> <FORM FSET? .OBJ ',CONTBIT>>>",
  "ABS": "<DEFMAC ABS ('NUM) <FORM COND (<FORM L? .NUM 0> <FORM - 0 .NUM>) (T .NUM)>>",
  "D-APPLY": "<DEFINE D-APPLY (STR FCN \"OPTIONAL\" FOO \"AUX\" RES) <COND (<NOT .FCN> <>) (T <COND (,DEBUG <COND (<NOT .STR> <TELL CR \"  Default ->\" CR>) (T <TELL CR \"  \" .STR \" -> \">)>)> <SET RES <COND (<ASSIGNED? FOO> <APPLY .FCN .FOO>) (T <APPLY .FCN>)>> <COND (<AND ,DEBUG .STR> <COND (<==? .RES 2> <TELL \"Fatal\" CR>) (<NOT .RES> <TELL \"Not handled\">) (T <TELL \"Handled\" CR>)>)> .RES)>>"
};
