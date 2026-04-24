#
#  use -I?? option to specify module search directory ex.:
#      perl -Iperl_deploy sample_toTanabe1.pl
#      perl -I. sample_toTanabe1.pl
#
# vim: set et sw=4 sts=4 ai : 
# あ

use utf8;
use strict;
use warnings;
use Encode;
use Carp;

# binmode STDIN,":encoding(cp932)";
# binmode STDOUT,":encoding(cp932)";




use Dumpvalue;
# Dumpvalue->new->dumpValue(...);

use TreeMatchLib;

useNewTreeClass Tree1 => '__A', '__B';






my $kei_u1 = { '|' => " \N{U+2502}  ", 'L' => " \N{U+2514}\N{U+2500} ", '|-' => " \N{U+251C}\N{U+2500} ",
' ' => "    ", '-' => " \N{U+2500}\N{U+2500} ", '|=' => " \N{U+255E}  " };
my $kei_u2 = { '|' => " \N{U+2502} ", 'L' => " \N{U+2514} ", '|-' => " \N{U+251C} ",
' ' => "    ", '-' => " \N{U+2500} ", '|=' => " \N{U+255E} " };
my $kei_a = { '|' => " |  ", 'L' => " +- ", '|-' => " +- ",
' ' => "    ", '-' => " -- ", '|=' => " |= " };
my $k = $kei_a;

# キャプチャのリスト (正確には{label=>文字列, capture=>キャプチャ} のリスト) を
#     引数に与えて、#    マッチしたノードやキャプチャしたノードを木と一緒に表示する
sub TWBTreePrintWithCaptures
{
    my $self = shift;
    my $ra_match = shift;
    my ($limit_level, $ra_path_idx, $rf_node_stringify, $level, $head, $head_c,$head_cc) = @_;
    if (@_ <= 2){ $ra_path_idx = []; $level = 0;  $head = ''; $head_c = '' ; $head_cc =''; }
    if (! defined $limit_level){ $limit_level = -1; } # limit なし

    if (!defined $rf_node_stringify)
    {
        $rf_node_stringify = sub
        {
            my ($cur_node) = @_;

            my $node_str = '(undef)';
            if (defined $cur_node)
            {
                my $k_info = join ",",
                map {
                    (defined $cur_node->GetAttribute($_))
                    ?  $_ . "=" .  $cur_node->GetAttribute($_)
                    :  $_ . "=(undef)";
                }
                $cur_node->AttributeKeysNonPrimary();
                $k_info = "  {$k_info}" if $k_info ne '';

                my $v = '';
                if ( defined $cur_node->Attr1() )
                {
                    $v = "  <" . $cur_node->Attr1() . ">"
                }

                my $attr0 = '(Attr0=undef)';
                if (defined $cur_node->Attr0())
                {
                    $attr0 = $cur_node->Attr0();
                }
                $node_str = $attr0 . $v .$k_info;
            }
            return $node_str;
        };
    };
    # MyAssertDataType('CODE', $rf_node_stringify);

    my @match_strings = ();
    for my $match (@$ra_match)
    {
        if (@$ra_path_idx + 1 != @{$match->{match}->{path}} ) { next; }
        my $match_flag = 1;
        for (my $i = 0; $i < @$ra_path_idx; $i++)
        {
            if ($ra_path_idx->[$i] != $match->{match}->{path}->[$i]->{next_child_index})
            {
                $match_flag = 0;
                last;
            }
        }
        if ( $match_flag ) { push @match_strings, $match->{label}; }
    }
    my $match_string = join (',', @match_strings);
    if ($match_string ne '') { $match_string = "    " . $match_string; }


    # my $kei_u1 = { '|' => " \N{U+2502}  ", 'L' => " \N{U+2514}\N{U+2500} ",
    #     '|-' => " \N{U+251C}\N{U+2500} ", ' ' => "    ",
    #     '-' => " \N{U+2500}\N{U+2500} ", '|=' => " \N{U+255E}  " };
    # my $kei_u2 = { '|' => " \N{U+2502} ", 'L' => " \N{U+2514} ",
    #     '|-' => " \N{U+251C} ", ' ' => "    ", '-' => " \N{U+2500} ",
    #     '|=' => " \N{U+255E} " };
    # my $kei_a = { '|' => " |  ", 'L' => " +- ", '|-' => " +- ",
    #     ' ' => "    ", '-' => " -- ", '|=' => " |= " };
    # my $k = { '|' => " |  ", 'L' => " +- ", '|-' => " +- ",
    #     ' ' => "    ", '-' => " -- ", '|=' => " |= " };

    my $root_node = $self->GetRootNode();
    my $node_str = $rf_node_stringify->($root_node);
    print $head . $head_c . $node_str . $match_string . "\n";
    return if !defined $root_node;
    if ($limit_level < 0 || $level < $limit_level)
    {
        for my $i( $root_node->ChildrenKeys())
        {
            push @$ra_path_idx, $i;
            if ($i == $root_node->NumChildren() -1)
            {
                # last child
                TWBTreePrintWithCaptures($root_node->NthChildSubtree($i), $ra_match, $limit_level, $ra_path_idx, $rf_node_stringify, $level + 1, $head.$head_cc, $k->{'L'}, $k->{' '});
            }
            else
            {
                TWBTreePrintWithCaptures($root_node->NthChildSubtree($i), $ra_match, $limit_level, $ra_path_idx, $rf_node_stringify, $level + 1, $head.$head_cc, $k->{'|-'}, $k->{'|'});
            }
            pop @$ra_path_idx;
        }
    }
    else
    {
        my $n_child = $root_node->NumChildren();
        if ($n_child > 1)
        { print $head. $head_cc . $k->{'|-'} . " ...\n"; }
        elsif ($n_child == 1)
        { print $head. $head_cc . $k->{'L'}. " ...\n"; }
        # else (in case $n_child == 0) do nothing
    }
}

# マッチリザルト (:TreePatternMatchResult) を引数に与えて、
#    マッチしたノードやキャプチャしたノードを木と一緒に表示する
sub TWBTreePrintWithMatchResult
{
    my ($prefix, $tree, $result, $matched_node_captures, $limit_level) = @_;

    # GetRootCapture
    my $i;
    my $k;

    my @captures = ();

    push @captures, {label =>$prefix . '(root)', match=>$result->GetRootCapture()};

    for $i(1 .. $#$matched_node_captures)
    { push @captures, {label => $prefix, match=>$matched_node_captures->[$i]}; }


    for $k($result->GetCaptureNames())
    { push @captures, {label => '##' . $k , match=>$result->Capture($k)}; }

    for $k($result->GetMultiCaptureNames())
    {
        my @multi_cap = $result->MultiCapture($k);
        for my $i (keys @multi_cap)
        {
            push @captures, {label => '##@' . $k . "[$i]" , match => $multi_cap[$i]};
        }
    }

    TWBTreePrintWithCaptures($tree, \@captures, $limit_level);
}




###############################################################
sub capture_eq
{
    my ($a, $b) = @_;
    # node, subtree
    # path->[{node, tree, next_child_index}]
    if ($a->{node} != $b->{node}) { return 0; }
    # if ($a->{subtree} != $b->{subtree}) { return 0; }
    if (@{$a->{path}} != @{$b->{path}}) { return 0; }
    my $n_path = @{$a->{path}};
    for (my $i = $n_path - 2; $i >= 0; $i--)
    {
        if ($a->{path}->[$i]->{node} != $b->{path}->[$i]->{node}) { return 0; }
        # if ($a->{path}->[$i]->{tree} != $b->{path}->[$i]->{tree}) { return 0; }
        if ($a->{path}->[$i]->{next_child_index} != $b->{path}->[$i]->{next_child_index}) { return 0; }
    }
    if ($a->{path}->[$n_path - 1]->{node} != $b->{path}->[$n_path - 1]->{node}) { return 0; }
    # if ($a->{path}->[$n_path - 1]->{tree} != $b->{path}->[$n_path - 1]->{tree}) { return 0; }
    return 1;
}
sub capture_in
{
    my ($c, $ra) = @_;

    for my $e(@$ra)
    {
        if (capture_eq($c, $e)) { return 1; }
    }
    return 0;
}


# マッチリザルトと next_nodes から
# matched_node_captures を作る関数
sub calc_matched_node_captures
{
    my ($root_capture, $ra_next_node_captures) = @_;
    my @ret_captures = ();
    my $iter = TreeWrapperBaseIterator->new($root_capture->Tree);
    while (1)
    {
        if ($iter->IsEnd())
        {
            $iter->MoveUp();
            if ($iter->IsRoot()) { last; }
            $iter->MoveNextSibling();
            next;
        }
        my $current_capture = MatchCapturePlace->newByIterator($iter, $root_capture);
        if (capture_in($current_capture, $ra_next_node_captures))
        {
            $iter->MoveNextSibling();
        }
        else {
            push @ret_captures, $current_capture;
            $iter->MoveDown();
        }
    }
    return \@ret_captures;
}

sub TreeMatchFind_with_matched_node
{
    my ($tree, $pattern) = @_;

    if (!defined $pattern)
    {
        confess "Error: called with wrong type parameter (TreeMatchFind_with_matched_node(tree, pattern)) (fc21c1ef_cb215ba7)\n";
    }

    my @results = ();
    my $result;
    my @next_capture_list = ();

    my @next_capture_list_add = ();
    my $base_root_capture = MatchCapturePlace->new($tree->GetRootNode(), $tree);

    while(1)
    {
        $result = TreeMatch($tree, $pattern, $base_root_capture, \@next_capture_list_add);
        if ($result) {
            $result->{matched_node_captures} = calc_matched_node_captures($base_root_capture, \@next_capture_list_add);
            push @results, $result;
        }
        my $n = @next_capture_list_add;
        for (my $i = $n - 1; $i >=0; $i--)
        {
            push @next_capture_list, $next_capture_list_add[$i];
        }
        @next_capture_list_add = ();
        if (@next_capture_list == 0) { last; }
        $base_root_capture = pop @next_capture_list;
        $tree = $base_root_capture->Tree();
    }
    return @results;
}



my $target_tree_pat;
$target_tree_pat = 'E > (E  > (E > I#xy) "+" I#yz1) "+" I#z';
print "[target = $target_tree_pat ]\n";
print "\n";

my $target_tree = TreeConstruct('Tree1', $target_tree_pat, undef)->Tree;
# $target_tree->TreePrint();

my $pat;

$pat ='E > E "+"';
print "[match (pat = $pat )]\n";
print "\n";

my $ra_next_node_captures = [];
my $result = TreeMatch($target_tree, $pat, undef, $ra_next_node_captures);
if ($result)
{
    # print $result->Node->Attr0 . "\n";
    # print ((join '; ', map {$_->Node->Attr0 } @$ra_next_node_captures)."\n");
    my $ra_matched = calc_matched_node_captures($result->GetRootCapture, $ra_next_node_captures);
    # print ((join '; ', map {$_->Node->Attr0 } @$ra_matched)."\n");

    TWBTreePrintWithMatchResult('MATCH', $target_tree, $result, $ra_matched);
}
print "\n";




$pat = '(E > -. "+" I#/z$/##term) | E > I#xy##term $';

print "[find (pat = $pat )]\n";
print "\n";

my @match_results = TreeMatchFind_with_matched_node($target_tree, $pat);

for my $match_result (@match_results)
{
my $n = @{$match_result->{matched_node_captures}};
TWBTreePrintWithMatchResult('MATCH', $target_tree, $match_result, $match_result->{matched_node_captures});

    # $match_result->aux_debug_short_print();
    print "----\n";
}
print "(end of result)\n";



print "\n";
print "done.\n\n";

