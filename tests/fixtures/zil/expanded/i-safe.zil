<ROUTINE I-SAFE () <COND (<EQUAL? ,HERE ,MUNGED-ROOM> <JIGS-UP "The room trembles and 5000 tons of rock fall on you, turning you
into a pancake.">) (<NOT ,DEAD> <PROG () <PRINTI "You may recall that recent explosion. Probably as a result of it, you
hear an ominous rumbling, as if a nearby room had collapsed."> <CRLF>> <COND (<EQUAL? ,MUNGED-ROOM ,SAFE-ROOM> <PUT <QUEUE I-LEDGE 8> 0 1>)>)> <MUNG-ROOM ,MUNGED-ROOM "The way is blocked by debris from an explosion.">>
