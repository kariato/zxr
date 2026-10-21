<ROUTINE I-CURTAIN () <SETG SCOL-ACTIVE <>> <COND (<EQUAL? ,HERE ,VAULT> <JIGS-UP "A metallic voice says \"Hello, Intruder! Your unauthorized presence
in the vault of the Bank of Zork has set off all sorts of nasty surprises,
most of which are fatal. This message brought to you by the Frobozz Magic
Vault Company.\"">) (<EQUAL? ,HERE ,VIEWING-EAST ,VIEWING-WEST ,SMALL-ROOM> <PROG () <PRINTI "You hear a faint voice say \"Curtain Door Closed.\""> <CRLF>> <COND (<EQUAL? ,HERE ,SMALL-ROOM> <COND (,ZGNOME-FLAG <RTRUE>) (T <PUT <QUEUE I-ZGNOME 3> 0 1> <SETG ZGNOME-FLAG T>)>)>)>>
