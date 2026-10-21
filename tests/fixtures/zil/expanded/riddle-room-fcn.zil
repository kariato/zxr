<ROUTINE RIDDLE-ROOM-FCN (RARG) <COND (<EQUAL? .RARG ,M-LOOK> <PROG () <PRINTI "This is a room which is bare on all sides. There is an exit down in
the northwest corner of the room. To the east is a great ">> <COND (<FSET? ,RIDDLE-DOOR ,OPENBIT> <PROG () <PRINTI "open">>) (T <PROG () <PRINTI "closed">>)> <PROG () <PRINTI " door made of
stone. Above the stone, the following words are written: \"No man shall
pass this door without solving this riddle:|
|
  What is tall as a house,|
    round as a cup,|
      and all the king's horses|
        can't draw it up?\"|
">>) (<EQUAL? .RARG ,M-BEG> <COND (<EQUAL? ,PRSA ,V?SAY ,V?ANSWER> <COND (<FSET? ,RIDDLE-DOOR ,OPENBIT> <RFALSE>) (<OR <EQUAL? <GET ,P-LEXV ,P-CONT> ,W?WELL> <EQUAL? <GET ,P-LEXV <+ ,P-CONT 2>> ,W?WELL>> <PROG () <PRINTI "There is a deafening clap of thunder and the stone door
quietly swings open to reveal a passageway beyond."> <CRLF>> <SCORE-UPD 5> <FSET ,RIDDLE-DOOR ,OPENBIT>) (T <PROG () <PRINTI "A hollow laugh seems to come from the stone door."> <CRLF>>)> <SETG P-CONT <>> <SETG QUOTE-FLAG <>> <RTRUE>)>)>>
