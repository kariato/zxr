<ROUTINE I-GNOME () <COND (<EQUAL? ,HERE ,LEDGE-1 ,LEDGE-2> <PROG () <PRINTI "A volcano gnome seems to walk straight out of the wall and ">> <COND (<IN? ,WAND ,WINNER> <PROG () <PRINTI "noticing the wand, straight back in."> <CRLF>>) (T <PROG () <PRINTI "says
\"I have a busy appointment schedule and little time to waste on
trespassers, but for a small fee I'll show you the way out.\" You
notice the gnome nervously glancing at his watch."> <CRLF>> <MOVE ,GNOME ,HERE>)>) (T <PUT <QUEUE I-GNOME 1> 0 1> <RFALSE>)>>
