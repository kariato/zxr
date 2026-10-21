<ROUTINE SPHERE-FCN ("AUX" FL) #DECL ((FL) <OR ATOM FALSE>) <COND (<AND <NOT ,CAGE-SOLVE-FLAG> <EQUAL? ,PRSA ,V?PUT ,V?MOVE ,V?TAKE>> <SET FL T>) (T <SET FL <>>)> <COND (<AND .FL <EQUAL? ,ADVENTURER ,WINNER>> <PROG () <PRINTI "As you reach for the sphere, a solid steel cage falls from the ceiling
to entrap you. To make matters worse, poisonous gas starts coming
into the room."> <CRLF> <CRLF>> <COND (<IN? ,ROBOT ,HERE> <MOVE ,ROBOT ,IN-CAGE> <FSET ,ROBOT ,NDESCBIT>)> <GOTO ,IN-CAGE> <MOVE ,CAGE ,HERE> <FSET ,CAGE ,NDESCBIT> <FCLEAR ,CAGE ,INVISIBLE> <PUT <QUEUE I-SPHERE 6> 0 1> T) (.FL <FSET ,PALANTIR-1 ,INVISIBLE> <REMOVE ,ROBOT> <FSET ,PRSO ,INVISIBLE> <MOVE ,CAGE ,CAGE-ROOM> <FCLEAR ,CAGE ,INVISIBLE> <JIGS-UP "As the robot reaches for the sphere, a solid steel cage falls from the
ceiling, trapping him. You can faintly hear his last words: \"Whirr,
buzz, click!\" A cloud of smoke rising from beneath the cage confirms
your fears about the fate of your brave mechanical friend."> T) (<EQUAL? ,PRSA ,V?EXAMINE ,V?LOOK-INSIDE> <PALANTIR>)>>
