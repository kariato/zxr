<ROUTINE ZORK3-FCN (RARG) <COND (<EQUAL? .RARG ,M-LOOK> <PROG () <PRINTI "Beyond the door is a roughly hewn staircase leading down into darkness.
The landing on which you stand is covered with carefully drawn magical runes
like those sketched upon the workbench of the Wizard of Frobozz.
These have been overlaid with sweeping green lines of enormous power, which
undulate back and forth across the landing. ">> <COND (<IN? ,WAND ,WINNER> <PROG () <PRINTI "The wand begins to vibrate in harmony with the motion of the lines.
You feel yourself compelled downward, and you yield, stepping onto the
staircase. As you pass the green lines, they flare and disappear with a
burst of light, and you tumble down the staircase!|
|
At the bottom, a vast red-lit hall stretches off into the distance.
Sinister statues guard the entrance to a dimly visible room far ahead.
With courage and cunning you have conquered the Wizard of Frobozz and
become the master of his domain, but the final challenge awaits!|
|
(The ultimate adventure concludes in \"Zork III: The Dungeon Master\".)|
|
"> <CRLF>> <SETG WON-FLAG T> <FINISH>) (T <JIGS-UP "The green curves begin to vibrate toward you, as if searching for
something. One by one your possessions glow bright green. Finally, you
are attacked by these magical wardens, and destroyed!">)>)>>
