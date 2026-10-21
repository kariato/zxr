<ROUTINE JIGS-UP ("OPTIONAL" (DESC <>) (PLAYER? <>)) #DECL ((PLAYER?) <OR ATOM FALSE>) <COND (.DESC <PROG () <PRINT .DESC> <CRLF>>)> <COND (<NOT <EQUAL? ,ADVENTURER ,WINNER>> <PROG () <PRINTI "
|    ****  The "> <PRINTD ,WINNER> <PRINTI " has died  ****
|
|">> <REMOVE ,WINNER> <SETG WINNER ,ADVENTURER> <SETG HERE <LOC ,WINNER>> <PROG () <PUSH 2> <RSTACK>>)> <PROG () <SCORE-UPD -10> <PROG () <PRINTI "
|    ****  You have died  ****
|
|">> <SETG DEAD T> <SETG SPELL? <>> <PUTP ,ADVENTURER ,P?ACTION 0> <SETG DEATHS <+ ,DEATHS 1>> <MOVE ,WINNER ,HERE> <PROG () <PRINTI "Now, let's take a look here...
Well, you probably deserve another chance. I can't quite fix you
up completely, but you can't have everything."> <CRLF> <CRLF>> <FCLEAR ,DEAD-PALANTIR-1 ,TOUCHBIT> <FCLEAR ,DEAD-PALANTIR-2 ,TOUCHBIT> <FCLEAR ,DEAD-PALANTIR-3 ,TOUCHBIT> <RANDOMIZE-OBJECTS> <GOTO ,DEAD-PALANTIR-1> <SETG P-CONT <>> <KILL-INTERRUPTS> <PROG () <PUSH 2> <RSTACK>>>>
