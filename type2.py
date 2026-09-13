class Freshness:
    
    def __init__(self, curr_date, expiry_date):
        self.curr_date = curr_date
        self.expiry_date = expiry_date

    def date(hey):
        pass




from datetime import datetime

print("Enter date: yyyy-mm-dd")
uip = input()

try:
    date_obj = datetime.strptime(uip, "%Y-%m-%d")
except ValueError:
    print("Invalid format")