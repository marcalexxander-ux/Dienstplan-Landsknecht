Dienstplan Landsknecht v4.4

Neu:
- Urlaub wird automatisch in den Dienstplan übertragen.
- Genehmigter Urlaub erscheint im Dienstplan als "urlaub".
- Direkt durch Geschäftsführung eingetragener Urlaub erscheint sofort im Dienstplan.
- Abgelehnter Urlaub entfernt passende "urlaub"-Einträge aus dem Dienstplan.
- Bestehende genehmigte Urlaube werden beim Laden automatisch synchronisiert.

Logik:
- Beantragt = noch nicht im Dienstplan.
- Genehmigt = im Dienstplan.
- Abgelehnt = nicht im Dienstplan.

Update:
1. ZIP entpacken.
2. Deine funktionierende config.js in den neuen Ordner kopieren und ersetzen.
3. supabase-v4-4-update.sql in Supabase SQL Editor ausführen.
4. Kompletten Ordner dienstplan-landsknecht bei Netlify hochladen.
5. Test:
   - Urlaub für Mitarbeiter eintragen/genehmigen.
   - Dienstplan Service/Küche öffnen.
   - Der Zeitraum muss als "urlaub" erscheinen.
