'''
Helper startup functions that I use often as a data scientist.
'''

try: 
    import polars as pl 
    def hist(data: pl.DataFrame | pl.LazyFrame, per = 'event_date', agg = pl.len().alias('n')):
        return (
            data.lazy().group_by(per).agg(agg).collect()
            .plot.bar(
                x = f'{per}:{"T" if "date" in per or "time" in per else "Q"}',
                y = f'{agg}:N'
            )
        )

except: pass

